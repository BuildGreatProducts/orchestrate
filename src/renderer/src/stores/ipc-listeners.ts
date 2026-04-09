import { useLoopsStore } from './loops'
import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { executeLoop } from './loop-execution-engine'

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
              // Prevent duplicate sends
              if (tasksState.activeAgentTasks[taskId]) break

              const taskTitle = board.tasks[taskId].title
              const agentType = agent === 'codex' ? 'codex' : 'claude-code'
              const systemPrompt = `You have orchestrate MCP tools. Your task ID is '${taskId}'. When you finish, call move_task to move it to 'review'. Use create_save_point to commit.`
              const shellQuote = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'"

              const buildCmd = async (): Promise<string> => {
                if (agentType === 'claude-code') {
                  const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
                  return mcpConfigPath
                    ? `claude --mcp-config ${mcpConfigPath} --append-system-prompt ${shellQuote(systemPrompt)} "$(cat tasks/task-${taskId}.md)"`
                    : `claude "$(cat tasks/task-${taskId}.md)"`
                } else {
                  const codexFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
                  return codexFlags
                    ? `codex ${codexFlags} "$(cat tasks/task-${taskId}.md)"`
                    : `codex "$(cat tasks/task-${taskId}.md)"`
                }
              }

              buildCmd()
                .then(async (cmd) => {
                  const tabName = `${agentType === 'codex' ? 'Codex' : 'Claude'}: ${taskTitle}`
                  const groupName = board!.tasks[taskId].groupName
                  const termStore = useTerminalStore.getState()
                  let tabId: string
                  if (groupName) {
                    const groupId = termStore.findOrCreateGroup(groupName)
                    tabId = await termStore.createTabInGroup(folder, groupId, tabName, cmd)
                  } else {
                    tabId = await termStore.createTab(folder, tabName, cmd)
                  }
                  return tabId
                })
                .then((tabId) => {
                  useTasksStore.getState().trackAgentTask(taskId, tabId, agentType as 'claude-code' | 'codex')
                  useAppStore.getState().showTerminal()
                })
                .catch((err) => {
                  console.error('[IPC] Failed to create terminal for task:', err)
                })
            }
          }
        }
        break
      }
      case 'loops':
        useLoopsStore.getState().loadLoops()
        break
      case 'loop-trigger': {
        if (data && typeof data === 'object') {
          const { loopId } = data as { loopId: string }
          if (loopId) executeLoop(loopId)
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

  // Listen for cron-scheduled loop triggers (separate IPC channel from agent tools)
  const cleanupLoopTrigger = window.orchestrate.onLoopTrigger((loopId) => {
    executeLoop(loopId)
  })

  // Listen for cron-scheduled task triggers
  const cleanupTaskTrigger = window.orchestrate.onTaskScheduleTrigger((taskId) => {
    const tasksState = useTasksStore.getState()
    const task = tasksState.board?.tasks[taskId]
    if (task?.agentType) {
      tasksState.sendToAgent(taskId, task.agentType)
    }
  })

  // Store cleanup so the next HMR reload can remove these listeners
  ;(window as unknown as Record<string, unknown>)[CLEANUP_KEY] = (): void => {
    cleanupStateChanged()
    cleanupLoopTrigger()
    cleanupTaskTrigger()
  }
}
