import { useTerminalStore } from './terminal'
import { useTasksStore } from './tasks'

/**
 * Fallback status sync for task-linked terminals. The main task execution engine
 * normally owns status transitions, but this keeps state sane if a linked
 * terminal exits outside that path.
 */
export async function handleTaskTerminalExit(terminalId: string, exitCode: number): Promise<void> {
  try {
    const tab = useTerminalStore.getState().tabs.find((item) => item.id === terminalId)
    const taskId = tab?.taskId
    if (!taskId) return

    const task = useTasksStore.getState().taskListsByProject[tab.projectFolder]?.tasks[taskId]
    if (!task || task.status !== 'running') return
    if (task.lastRun?.terminalId && task.lastRun.terminalId !== terminalId) return

    await useTasksStore.getState().updateTaskRun(
      taskId,
      {
        ...(task.lastRun ?? {
          id: `external-${Date.now().toString(36)}`,
          startedAt: new Date().toISOString()
        }),
        terminalId,
        status: exitCode === 0 ? 'completed' : 'failed',
        exitCode,
        finishedAt: new Date().toISOString()
      },
      exitCode === 0 ? 'done' : 'failed',
      tab.projectFolder
    )
  } catch (err) {
    console.error('[TaskBridge] handleTaskTerminalExit error:', err)
  }
}
