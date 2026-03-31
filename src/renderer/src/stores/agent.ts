import { create } from 'zustand'
import { useLoopsStore } from './loops'
import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { executeLoop } from './loop-execution-engine'
import type { ChatMessageData, StreamItemData } from '@shared/types'

export type StreamItem =
  | { kind: 'text'; content: string }
  | { kind: 'tool_use'; tool: string; input: Record<string, unknown> }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
  items?: StreamItem[]
  timestamp: number
}

// Lazy reference to avoid circular import — set by chat-history store on init
let _autoSaveFn: (() => Promise<void>) | null = null
export function registerAutoSave(fn: () => Promise<void>): void {
  _autoSaveFn = fn
}

// Fix #7: type guard for StreamItemData -> StreamItem conversion
function isValidStreamItem(item: StreamItemData): item is StreamItem {
  if (item.kind === 'text') return typeof item.content === 'string'
  if (item.kind === 'tool_use') return typeof item.tool === 'string' && item.input !== undefined
  return false
}

interface AgentState {
  messages: ChatMessage[]
  isStreaming: boolean
  hasApiKey: boolean | null
  streamingItems: StreamItem[]

  checkApiKey: () => Promise<void>
  setApiKey: (key: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  cancelMessage: () => Promise<void>
  clearConversation: () => Promise<void>
  loadMessages: (messages: ChatMessageData[]) => void
  resetState: () => void
}

// --- Global IPC listeners (registered once) ---
// Use a window-level key to survive Vite HMR module reloads.
// Without this, each HMR update adds another listener, causing duplicates.

const CLEANUP_KEY = '__agentIpcCleanup'

function ensureGlobalListeners(): void {
  // Clean up previous listeners (handles HMR reloads that re-evaluate this module)
  const prev = (window as unknown as Record<string, unknown>)[CLEANUP_KEY]
  if (typeof prev === 'function') {
    prev()
  }

  const cleanupResponse = window.orchestrate.onAgentResponse((chunk) => {
    const state = useAgentStore.getState()

    if (chunk.type === 'text' && chunk.content) {
      const items = [...state.streamingItems]
      const last = items[items.length - 1]
      if (last && last.kind === 'text') {
        items[items.length - 1] = { kind: 'text', content: last.content + chunk.content }
      } else {
        items.push({ kind: 'text', content: chunk.content })
      }
      useAgentStore.setState({ streamingItems: items })
    } else if (chunk.type === 'tool_use' && chunk.tool && chunk.input) {
      useAgentStore.setState({
        streamingItems: [
          ...state.streamingItems,
          { kind: 'tool_use', tool: chunk.tool, input: chunk.input }
        ]
      })
    } else if (chunk.type === 'done') {
      const { streamingItems, messages } = useAgentStore.getState()
      if (streamingItems.length > 0) {
        const content = streamingItems
          .filter((i): i is StreamItem & { kind: 'text' } => i.kind === 'text')
          .map((i) => i.content)
          .join('')
        const toolUses = streamingItems
          .filter((i): i is StreamItem & { kind: 'tool_use' } => i.kind === 'tool_use')
          .map((i) => ({ tool: i.tool, input: i.input }))
        const msg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content,
          toolUses: toolUses.length > 0 ? toolUses : undefined,
          items: [...streamingItems],
          timestamp: Date.now()
        }
        useAgentStore.setState({
          messages: [...messages, msg],
          streamingItems: [],
          isStreaming: false
        })
      } else {
        useAgentStore.setState({ isStreaming: false })
      }
      // Auto-save conversation after assistant response completes
      _autoSaveFn?.()
    } else if (chunk.type === 'error') {
      const { streamingItems, messages } = useAgentStore.getState()
      const newMessages = [...messages]

      // Finalize any partial assistant message
      if (streamingItems.length > 0) {
        const content = streamingItems
          .filter((i): i is StreamItem & { kind: 'text' } => i.kind === 'text')
          .map((i) => i.content)
          .join('')
        const toolUses = streamingItems
          .filter((i): i is StreamItem & { kind: 'tool_use' } => i.kind === 'tool_use')
          .map((i) => ({ tool: i.tool, input: i.input }))
        newMessages.push({
          id: `msg-${Date.now()}-partial`,
          role: 'assistant',
          content,
          toolUses: toolUses.length > 0 ? toolUses : undefined,
          items: [...streamingItems],
          timestamp: Date.now()
        })
      }

      // Add error message
      newMessages.push({
        id: `msg-${Date.now()}-error`,
        role: 'system',
        content: chunk.content || 'An unknown error occurred.',
        timestamp: Date.now()
      })

      useAgentStore.setState({
        messages: newMessages,
        streamingItems: [],
        isStreaming: false
      })
      // Auto-save conversation after error
      _autoSaveFn?.()
    }
  })

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
                  useAppStore.getState().setActiveTab('agents')
                })
                .catch((err) => {
                  console.error('[Agent] Failed to create terminal for task:', err)
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
          const { name, command, taskId } = data as {
            name?: string
            command?: string
            taskId?: string
          }
          useTerminalStore
            .getState()
            .createTab(folder, name, command, taskId)
            .then(() => {
              useAppStore.getState().setActiveTab('agents')
            })
            .catch((err) => {
              console.error('[Agent] Failed to create terminal tab:', err)
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
    cleanupResponse()
    cleanupStateChanged()
    cleanupLoopTrigger()
    cleanupTaskTrigger()
  }
}

export const useAgentStore = create<AgentState>((set, get) => {
  // Register global listeners immediately
  ensureGlobalListeners()

  return {
    messages: [],
    isStreaming: false,
    hasApiKey: null,
    streamingItems: [],

    checkApiKey: async () => {
      try {
        const hasKey = await window.orchestrate.hasApiKey()
        set({ hasApiKey: hasKey })
      } catch {
        set({ hasApiKey: false })
      }
    },

    setApiKey: async (key: string) => {
      await window.orchestrate.setApiKey(key)
      set({ hasApiKey: true })
    },

    sendMessage: async (text: string) => {
      const { messages } = get()
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now()
      }
      set({
        messages: [...messages, userMsg],
        isStreaming: true,
        streamingItems: []
      })
      // Save immediately so the conversation appears in history as soon as the user sends
      _autoSaveFn?.()
      try {
        await window.orchestrate.sendAgentMessage(text)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: `msg-${Date.now()}-error`,
              role: 'system' as const,
              content: errorMessage,
              timestamp: Date.now()
            }
          ],
          isStreaming: false,
          streamingItems: []
        }))
        // Fix #2: auto-save on sendMessage rejection so user turn + error are persisted
        _autoSaveFn?.()
      }
    },

    cancelMessage: async () => {
      await window.orchestrate.cancelAgentMessage()
    },

    clearConversation: async () => {
      await window.orchestrate.clearAgentConversation()
      set({ messages: [], streamingItems: [], isStreaming: false })
    },

    // Fix #7: validate items with type guard instead of blind cast
    loadMessages: (msgs: ChatMessageData[]) => {
      const mapped: ChatMessage[] = msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolUses: m.toolUses,
        items: m.items?.filter(isValidStreamItem),
        timestamp: m.timestamp
      }))
      set({ messages: mapped, streamingItems: [], isStreaming: false })
    },

    resetState: () => {
      set({
        messages: [],
        isStreaming: false,
        streamingItems: [],
        hasApiKey: null
      })
    }
  }
})
