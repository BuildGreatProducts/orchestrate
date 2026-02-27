import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { ColumnId, BoardState } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'

const COLUMNS: ColumnId[] = ['draft', 'planning', 'in-progress', 'review', 'done']

function findColumnForTask(board: BoardState, taskId: string): ColumnId | null {
  for (const col of COLUMNS) {
    if (board.columns[col].includes(taskId)) return col
  }
  return null
}

export default function KanbanBoard(): React.JSX.Element {
  const board = useTasksStore((s) => s.board)
  const loadBoard = useTasksStore((s) => s.loadBoard)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Directly mutate the store's board for live preview during drag
  const setBoardDirect = useTasksStore.setState

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!board) return
      const { active, over } = event
      if (!over) return

      const activeTaskId = active.id as string
      const overId = over.id as string

      const fromCol = findColumnForTask(board, activeTaskId)
      if (!fromCol) return

      // Determine target column: either directly a column, or the column containing the over task
      let toCol: ColumnId | null = null
      if (COLUMNS.includes(overId as ColumnId)) {
        toCol = overId as ColumnId
      } else {
        toCol = findColumnForTask(board, overId)
      }
      if (!toCol || fromCol === toCol) return

      // Move between columns (live preview)
      const fromItems = [...board.columns[fromCol]]
      const toItems = [...board.columns[toCol]]

      const fromIdx = fromItems.indexOf(activeTaskId)
      if (fromIdx === -1) return
      fromItems.splice(fromIdx, 1)

      const overIdx = toItems.indexOf(overId)
      const insertIdx = overIdx !== -1 ? overIdx : toItems.length
      toItems.splice(insertIdx, 0, activeTaskId)

      setBoardDirect({
        board: {
          ...board,
          columns: {
            ...board.columns,
            [fromCol]: fromItems,
            [toCol]: toItems
          }
        }
      })
    },
    [board, setBoardDirect]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null)
      if (!board) return

      const { active, over } = event
      if (!over) return

      const activeTaskId = active.id as string
      const overId = over.id as string

      const col = findColumnForTask(board, activeTaskId)
      if (!col) return

      // Within-column reorder
      const items = board.columns[col]
      const oldIdx = items.indexOf(activeTaskId)
      const newIdx = items.indexOf(overId)

      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const reordered = arrayMove(items, oldIdx, newIdx)
        const newBoard: BoardState = {
          ...board,
          columns: { ...board.columns, [col]: reordered }
        }
        setBoardDirect({ board: newBoard })
        await window.orchestrate.saveBoard(newBoard)
      } else {
        // Cross-column move already applied in handleDragOver — persist latest store state
        const currentBoard = useTasksStore.getState().board
        if (currentBoard) {
          await window.orchestrate.saveBoard(currentBoard)
        }
      }
    },
    [board, setBoardDirect]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    loadBoard()
  }, [loadBoard])

  if (!board) return <div />

  const totalTasks = Object.keys(board.tasks).length
  const activeTask = activeId ? board.tasks[activeId] : null

  if (totalTasks === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="rounded-full bg-zinc-800 p-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-zinc-500">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="text-lg font-medium text-zinc-300">No tasks yet</p>
        <p className="max-w-xs text-center text-sm text-zinc-500">
          Create your first task by clicking the + button in the Draft column, or use Cmd+N.
        </p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {COLUMNS.map((colId) => (
          <KanbanColumn
            key={colId}
            columnId={colId}
            taskIds={board.columns[colId]}
            tasks={board.tasks}
          />
        ))}
      </div>

      <DragOverlay>
        {activeId && activeTask ? (
          <TaskCard id={activeId} task={activeTask} isDragOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
