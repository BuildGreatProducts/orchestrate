import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { executeTask } from './task-execution-engine'
import { taskExecutionKey } from './tasks'

// Tracks task IDs with in-flight terminal creation to prevent duplicate sends
const pendingTaskAgents = new Set<string>()

// --- Global IPC listeners (registered once) ---
// Use a window-level key to survive Vite HMR module reloads.
// Without this, each HMR update adds another listener, causing duplicates.

const CLEANUP_KEY = '__ipcListenersCleanup'

export function ensureGlobalIpcListeners(): void {
  // Clean up previous listeners (handles HMR reloads that re-evaluate this module)
  const prev = (window as unknown as Record<string, unknown>)[CLEANUP_KEY]
  if (typeof prev === 'function') {
    prev()
  }

  const cleanupStateChanged = window.orchestrate.onAgentStateChanged((domain, data) => {
    const folder = useAppStore.getState().currentFolder
    const projectFolder =
      data && typeof data === 'object' && 'projectFolder' in data
        ? (data as { projectFolder?: string }).projectFolder
        : undefined
    switch (domain) {
      case 'tasks':
        useTasksStore.getState().loadTasks(projectFolder ?? folder)
        break
      case 'task-agent': {
        const targetFolder = projectFolder ?? folder
        if (targetFolder && data && typeof data === 'object') {
          const { taskId, agent } = data as { taskId: string; agent: string }
          if (taskId && /^[A-Za-z0-9_-]{1,64}$/.test(taskId)) {
            const tasksState = useTasksStore.getState()
            const task = tasksState.taskListsByProject[targetFolder]?.tasks[taskId]
            const agentType = agent || task?.agentType
            const key = taskExecutionKey(targetFolder, taskId)
            // Prevent duplicate sends (check both committed and in-flight)
            if (tasksState.activeAgentTasks[key] || pendingTaskAgents.has(key)) break
            pendingTaskAgents.add(key)
            executeTask(taskId, agentType, { projectFolder: targetFolder })
              .catch((err) => {
                console.error('[IPC] Failed to execute task:', err)
              })
              .finally(() => {
                pendingTaskAgents.delete(key)
              })
          }
        }
        break
      }
      case 'task-trigger': {
        const targetFolder = projectFolder ?? folder
        if (targetFolder && data && typeof data === 'object') {
          const { taskId } = data as { taskId: string }
          if (taskId) executeTask(taskId, undefined, { projectFolder: targetFolder })
        }
        break
      }
      case 'history':
        useHistoryStore.getState().refreshAll()
        break
      case 'files':
        useFilesStore.getState().refreshTree()
        break
      case 'terminal': {
        const targetFolder = projectFolder ?? folder
        if (targetFolder && data && typeof data === 'object') {
          const { name, command } = data as {
            name?: string
            command?: string
          }
          useTerminalStore
            .getState()
            .createTab({
              cwd: targetFolder,
              name,
              command,
              kind: command ? 'command' : 'terminal'
            })
            .then(() => {
              if (targetFolder === useAppStore.getState().currentFolder) {
                useAppStore.getState().showTerminal()
              }
            })
            .catch((err) => {
              console.error('[IPC] Failed to create terminal tab:', err)
            })
        }
        break
      }
    }
  })

  // Listen for cron-scheduled task triggers
  const cleanupTaskTrigger = window.orchestrate.onTaskScheduleTrigger((taskId, projectFolder) => {
    const tasksState = useTasksStore.getState()
    const folder =
      typeof projectFolder === 'string' && projectFolder.trim().length > 0 ? projectFolder : null
    if (!folder) {
      console.error(`[Scheduler] Missing project folder for scheduled task ${taskId}`)
      return
    }
    const run = (): void => {
      const task = useTasksStore.getState().taskListsByProject[folder]?.tasks[taskId]
      if (task) {
        void executeTask(taskId, task.agentType, { projectFolder: folder }).catch((err) => {
          console.error(
            `[Scheduler] Failed to execute scheduled task ${taskId} with agent ${task.agentType}:`,
            err
          )
        })
      }
    }
    if (tasksState.taskListsByProject[folder]?.tasks[taskId]) {
      run()
    } else {
      tasksState
        .loadTasks(folder)
        .then(run)
        .catch((err) => {
          console.error('[Scheduler] Failed to load scheduled task:', err)
        })
    }
  })

  // Store cleanup so the next HMR reload can remove these listeners
  ;(window as unknown as Record<string, unknown>)[CLEANUP_KEY] = (): void => {
    cleanupStateChanged()
    cleanupTaskTrigger()
  }
}
