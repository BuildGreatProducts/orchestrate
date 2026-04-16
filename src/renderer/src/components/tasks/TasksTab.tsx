import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import Spinner from '@renderer/components/ui/Spinner'
import KanbanBoard from './KanbanBoard'
import TaskDetailView from './TaskDetailView'

export default function TasksTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const board = useTasksStore((s) => s.board)
  const isLoading = useTasksStore((s) => s.isLoading)
  const hasLoaded = useTasksStore((s) => s.hasLoaded)
  const loadError = useTasksStore((s) => s.loadError)
  const loadBoard = useTasksStore((s) => s.loadBoard)
  const resetBoard = useTasksStore((s) => s.resetBoard)
  const viewingTaskId = useTasksStore((s) => s.viewingTaskId)

  useEffect(() => {
    if (currentFolder) {
      loadBoard()
    } else {
      resetBoard()
    }
  }, [currentFolder, loadBoard, resetBoard])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Tasks</h2>
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

  // Show full-page task detail or kanban board
  if (viewingTaskId && board.tasks[viewingTaskId]) {
    return (
      <div className="flex h-full w-full">
        <TaskDetailView />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <KanbanBoard />
    </div>
  )
}
