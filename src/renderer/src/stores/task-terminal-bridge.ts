import { useTerminalStore } from './terminal'
import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { toast } from './toast'
import type { ColumnId } from '@shared/types'

/**
 * Handles post-completion workflow when a task-linked terminal exits.
 * Called from the exit handler in useTerminal — fire-and-forget.
 */
export async function handleTaskTerminalExit(
  terminalId: string,
  exitCode: number
): Promise<void> {
  try {
    // 1. Look up taskId — return early if this terminal isn't linked to a task
    const taskId = useTerminalStore.getState().getTaskId(terminalId)
    if (!taskId) return

    // 2. Validate task still exists on the board
    const { board, moveTask } = useTasksStore.getState()
    if (!board?.tasks[taskId]) return

    // 3. Only auto-move if task is still in "in-progress"
    let currentColumn: ColumnId | null = null
    for (const col of Object.keys(board.columns) as ColumnId[]) {
      if (board.columns[col].includes(taskId)) {
        currentColumn = col
        break
      }
    }
    if (currentColumn !== 'in-progress') return

    const taskTitle = board.tasks[taskId].title

    // 4. Create a post-run save point if git repo with uncommitted changes
    try {
      const { isGitRepo } = useHistoryStore.getState()
      if (isGitRepo) {
        const hasChanges = await window.orchestrate.hasUncommittedChanges()
        if (hasChanges) {
          await window.orchestrate.createSavePoint(`Agent completed: ${taskTitle}`)
        }
      }
    } catch (err) {
      console.warn('[TaskBridge] Save point failed:', err)
    }

    // 5. Move task based on exit code
    if (exitCode === 0) {
      await moveTask(taskId, 'review', 0)
      toast.success(`Task "${taskTitle}" moved to Review`)
    } else {
      toast.error(`Agent exited with code ${exitCode} — "${taskTitle}" stays in progress`)
    }

    // 6. Refresh task board and git history
    useTasksStore.getState().loadBoard()
    useHistoryStore.getState().refreshAll()
  } catch (err) {
    console.error('[TaskBridge] handleTaskTerminalExit error:', err)
  }
}
