import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import { useLoopsStore } from '@renderer/stores/loops'
import Spinner from '@renderer/components/ui/Spinner'
import KanbanBoard from './KanbanBoard'
import TaskDetailPanel from './TaskDetailPanel'
import LoopDetailPanel from '@renderer/components/loops/LoopDetailPanel'

export default function TasksTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const board = useTasksStore((s) => s.board)
  const isLoading = useTasksStore((s) => s.isLoading)
  const hasLoaded = useTasksStore((s) => s.hasLoaded)
  const loadError = useTasksStore((s) => s.loadError)
  const loadBoard = useTasksStore((s) => s.loadBoard)
  const resetBoard = useTasksStore((s) => s.resetBoard)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const loadLoops = useLoopsStore((s) => s.loadLoops)
  const editingLoop = useLoopsStore((s) => s.editingLoop)
  const setEditingLoop = useLoopsStore((s) => s.setEditingLoop)
  const loops = useLoopsStore((s) => s.loops)

  useEffect(() => {
    if (currentFolder) {
      loadBoard()
      loadLoops()
    } else {
      resetBoard()
    }
  }, [currentFolder, loadBoard, loadLoops, resetBoard])

  // Determine if selected task is a loop type
  const selectedTask = selectedTaskId && board ? board.tasks[selectedTaskId] : null
  const isLoopTask = selectedTask?.type === 'loop'
  const selectedLoop = isLoopTask && selectedTask?.loopId
    ? loops.find((l) => l.id === selectedTask.loopId) ?? null
    : null

  // Coordinate panel state: selecting a task closes the loop panel and vice versa
  useEffect(() => {
    if (!selectedTaskId) return
    if (isLoopTask && selectedLoop) {
      // Loop task clicked → open loop panel
      setEditingLoop(selectedLoop)
    } else if (!isLoopTask) {
      // Regular task clicked → close loop panel
      setEditingLoop(null)
    }
  }, [selectedTaskId, isLoopTask, selectedLoop, setEditingLoop])

  // When a new/standalone loop is being edited (not from a task card), deselect any task
  useEffect(() => {
    if (editingLoop !== null && !isLoopTask) {
      selectTask(null)
    }
  }, [editingLoop, isLoopTask, selectTask])

  // When the loop panel closes while a loop task is selected, deselect the card
  useEffect(() => {
    if (isLoopTask && editingLoop === null) {
      selectTask(null)
    }
  }, [editingLoop, isLoopTask, selectTask])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
          <p className="mt-3 max-w-xs text-sm text-zinc-500">
            Plan tasks, coordinate agents, and manage workflows across your project.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading || !hasLoaded) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Spinner className="text-zinc-500" />
        <p className="text-sm text-zinc-500">Loading board...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">Failed to load board</p>
          <p className="mt-1 text-sm text-zinc-600">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Failed to load board</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
      {selectedTaskId && !isLoopTask && editingLoop === null && <TaskDetailPanel />}
      {editingLoop !== null && <LoopDetailPanel />}
    </div>
  )
}
