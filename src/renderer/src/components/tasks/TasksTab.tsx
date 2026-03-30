import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import { useLoopsStore } from '@renderer/stores/loops'
import { executeLoop } from '@renderer/stores/loop-execution-engine'
import Spinner from '@renderer/components/ui/Spinner'
import KanbanBoard from './KanbanBoard'
import TaskDetailPanel from './TaskDetailPanel'
import LoopEditorModal from '@renderer/components/loops/LoopEditorModal'
import type { Loop } from '@shared/types'

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
  const createLoop = useLoopsStore((s) => s.createLoop)
  const updateLoop = useLoopsStore((s) => s.updateLoop)
  const loops = useLoopsStore((s) => s.loops)

  // Listen for schedule triggers
  useEffect(() => {
    const cleanup = window.orchestrate.onLoopTrigger((loopId) => {
      executeLoop(loopId)
    })
    return cleanup
  }, [])

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

  const handleLoopSave = async (
    data: Omit<Loop, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<void> => {
    try {
      if (data.id) {
        const existing = loops.find((l) => l.id === data.id)
        if (existing) {
          await updateLoop({
            ...existing,
            name: data.name,
            steps: data.steps,
            schedule: data.schedule,
            agentType: data.agentType,
            lastRun: data.lastRun
          })
          // Update the task title on the board to match
          if (selectedTaskId && board?.tasks[selectedTaskId]) {
            const { updateTaskTitle } = useTasksStore.getState()
            await updateTaskTitle(selectedTaskId, data.name)
          }
        }
      } else {
        const newLoop = await createLoop(data)
        await useTasksStore.getState().createLoopTask('planning', newLoop)
      }
      // Only clear editor state on success
      setEditingLoop(null)
      selectTask(null)
    } catch (err) {
      console.error('[Tasks] Failed to save loop:', err)
    }
  }

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
      {selectedTaskId && !isLoopTask && <TaskDetailPanel />}
      {selectedTaskId && isLoopTask && selectedLoop && (
        <LoopEditorModal
          initial={selectedLoop}
          onSave={handleLoopSave}
          onCancel={() => selectTask(null)}
        />
      )}
      {editingLoop !== null && !selectedTaskId && (
        <LoopEditorModal
          initial={editingLoop}
          onSave={handleLoopSave}
          onCancel={() => setEditingLoop(null)}
        />
      )}
    </div>
  )
}
