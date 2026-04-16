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

const COLUMNS: ColumnId[] = ['planning', 'in-progress', 'review', 'done']

function findColumnForTask(board: BoardState, taskId: string): ColumnId | null {
  for (const col of COLUMNS) {
    if (board.columns[col].includes(taskId)) return col
  }
  return null
}

export default function KanbanBoard(): React.JSX.Element {
  const board = useTasksStore((s) => s.board)
  const loadBoard = useTasksStore((s) => s.loadBoard)
  const createTask = useTasksStore((s) => s.createTask)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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

      let toCol: ColumnId | null = null
      if (COLUMNS.includes(overId as ColumnId)) {
        toCol = overId as ColumnId
      } else {
        toCol = findColumnForTask(board, overId)
      }
      if (!toCol || fromCol === toCol) return

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

  if (!board) return <div className="h-full w-full" />

  const totalTasks = Object.keys(board.tasks).length
  const activeTask = activeId ? board.tasks[activeId] : null

  if (totalTasks === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Tasks</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Plan tasks, coordinate agents, and manage workflows across your project.
        </p>
        <button
          onClick={() => createTask('planning', 'New task')}
          className="mt-2 rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
        >
          New Task
        </button>
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
      <div className="flex h-full w-full gap-3 overflow-x-auto p-4">
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
