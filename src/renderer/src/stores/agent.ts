import { create } from 'zustand'
import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'

export type StreamItem =
  | { kind: 'text'; content: string }
  | { kind: 'tool_use'; tool: string; input: Record<string, unknown> }

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
  items?: StreamItem[]
  timestamp: number
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
  resetState: () => void
}

// --- Global IPC listeners (registered once) ---

let globalListenersRegistered = false

function ensureGlobalListeners(): void {
  if (globalListenersRegistered) return
  globalListenersRegistered = true

  window.orchestrate.onAgentResponse((chunk) => {
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
    }
  })

  window.orchestrate.onAgentToolUse(() => {
    // Tool uses are also handled via agent:response chunks;
    // this listener is available for additional side effects if needed
  })

  window.orchestrate.onAgentStateChanged((domain, data) => {
    const folder = useAppStore.getState().currentFolder
    switch (domain) {
      case 'tasks':
        useTasksStore.getState().loadBoard()
        break
      case 'history':
        useHistoryStore.getState().refreshAll()
        break
      case 'files':
        useFilesStore.getState().refreshTree()
        break
      case 'terminal': {
        if (folder && data && typeof data === 'object') {
          const { name, command } = data as { name?: string; command?: string }
          useTerminalStore
            .getState()
            .createTab(folder, name, command)
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
      }
    },

    cancelMessage: async () => {
      await window.orchestrate.cancelAgentMessage()
    },

    clearConversation: async () => {
      await window.orchestrate.clearAgentConversation()
      set({ messages: [], streamingItems: [] })
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
