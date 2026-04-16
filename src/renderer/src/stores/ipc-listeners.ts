import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { useAgentsStore } from './agents'
import { buildAgentCommand } from '../lib/agent-command-builder'
import { executeTask } from './task-execution-engine'

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
    switch (domain) {
      case 'tasks':
        useTasksStore.getState().loadBoard()
        break
      case 'task-agent': {
        if (folder && data && typeof data === 'object') {
          const { taskId, agent } = data as { taskId: string; agent: string }
          if (taskId && /^[A-Za-z0-9_-]{1,64}$/.test(taskId)) {
            const tasksState = useTasksStore.getState()
            const board = tasksState.board
            if (board?.tasks[taskId]) {
              // Prevent duplicate sends (check both committed and in-flight)
              if (tasksState.activeAgentTasks[taskId] || pendingTaskAgents.has(taskId)) break
              pendingTaskAgents.add(taskId)

              const taskTitle = board.tasks[taskId].title
              const agentConfig = useAgentsStore.getState().getAgent(agent)
              if (!agentConfig) {
                console.error('[IPC] Unknown agent type:', agent)
                pendingTaskAgents.delete(taskId)
                break
              }
              const systemPrompt = `You have orchestrate MCP tools. Your task ID is '${taskId}'. When you finish, call move_task to move it to 'review'. Use create_save_point to commit.`

              const buildCmd = async (): Promise<string> => {
                const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
                const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
                return buildAgentCommand({
                  agent: agentConfig,
                  prompt: '',
                  systemPrompt,
                  taskFile: `tasks/task-${taskId}.md`,
                  mcpConfigPath,
                  codexMcpFlags
                })
              }

              buildCmd()
                .then(async (cmd) => {
                  const tabName = `${agentConfig.displayName}: ${taskTitle}`
                  const groupName = board!.tasks[taskId].groupName
                  const termStore = useTerminalStore.getState()
                  let tabId: string
                  if (groupName) {
                    const groupId = termStore.findOrCreateGroup(groupName, folder)
                    tabId = await termStore.createTabInGroup(folder, groupId, tabName, cmd)
                  } else {
                    tabId = await termStore.createTab(folder, tabName, cmd)
                  }
                  return tabId
                })
                .then((tabId) => {
                  useTasksStore.getState().trackAgentTask(taskId, tabId, agent)
                  useAppStore.getState().showTerminal()
                })
                .catch((err) => {
                  console.error('[IPC] Failed to create terminal for task:', err)
                })
                .finally(() => {
                  pendingTaskAgents.delete(taskId)
                })
            }
          }
        }
        break
      }
      case 'task-trigger': {
        if (data && typeof data === 'object') {
          const { taskId } = data as { taskId: string }
          if (taskId) executeTask(taskId)
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
        if (folder && data && typeof data === 'object') {
          const { name, command } = data as {
            name?: string
            command?: string
          }
          useTerminalStore
            .getState()
            .createTab(folder, name, command)
            .then(() => {
              useAppStore.getState().showTerminal()
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
  const cleanupTaskTrigger = window.orchestrate.onTaskScheduleTrigger((taskId) => {
    const tasksState = useTasksStore.getState()
    const task = tasksState.board?.tasks[taskId]
    if (!task) return
    // If task has steps, execute them sequentially; otherwise send to agent
    if (task.steps && task.steps.length > 0) {
      executeTask(taskId)
    } else if (task.agentType) {
      tasksState.sendToAgent(taskId, task.agentType)
    }
  })

  // Store cleanup so the next HMR reload can remove these listeners
  ;(window as unknown as Record<string, unknown>)[CLEANUP_KEY] = (): void => {
    cleanupStateChanged()
    cleanupTaskTrigger()
  }
}
