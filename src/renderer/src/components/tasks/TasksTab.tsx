import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import KanbanBoard from './KanbanBoard'
import TaskDetailPanel from './TaskDetailPanel'

export default function TasksTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const board = useTasksStore((s) => s.board)
  const isLoading = useTasksStore((s) => s.isLoading)
  const hasLoaded = useTasksStore((s) => s.hasLoaded)
  const loadError = useTasksStore((s) => s.loadError)
  const loadBoard = useTasksStore((s) => s.loadBoard)
  const resetBoard = useTasksStore((s) => s.resetBoard)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)

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
          <p className="text-lg text-zinc-200">No folder selected</p>
          <p className="mt-1 text-sm text-zinc-500">
            Select a project folder to manage tasks
          </p>
        </div>
      </div>
    )
  }

  if (isLoading || !hasLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">Loading board...</p>
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
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  )
}
