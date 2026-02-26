import { create } from 'zustand'
import { useTasksStore } from './tasks'
import { useHistoryStore } from './history'
import { useFilesStore } from './files'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
  timestamp: number
}

interface AgentState {
  messages: ChatMessage[]
  isStreaming: boolean
  hasApiKey: boolean | null
  streamingContent: string
  currentToolUses: { tool: string; input: Record<string, unknown> }[]

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
      useAgentStore.setState({
        streamingContent: state.streamingContent + chunk.content
      })
    } else if (chunk.type === 'tool_use') {
      useAgentStore.setState({
        currentToolUses: [
          ...state.currentToolUses,
          { tool: chunk.tool!, input: chunk.input! }
        ]
      })
    } else if (chunk.type === 'done') {
      const { streamingContent, currentToolUses, messages } = useAgentStore.getState()
      if (streamingContent || currentToolUses.length > 0) {
        const msg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: streamingContent,
          toolUses: currentToolUses.length > 0 ? [...currentToolUses] : undefined,
          timestamp: Date.now()
        }
        useAgentStore.setState({
          messages: [...messages, msg],
          streamingContent: '',
          currentToolUses: [],
          isStreaming: false
        })
      } else {
        useAgentStore.setState({ isStreaming: false })
      }
    } else if (chunk.type === 'error') {
      const { streamingContent, currentToolUses, messages } = useAgentStore.getState()
      const newMessages = [...messages]

      // Finalize any partial assistant message
      if (streamingContent || currentToolUses.length > 0) {
        newMessages.push({
          id: `msg-${Date.now()}-partial`,
          role: 'assistant',
          content: streamingContent,
          toolUses: currentToolUses.length > 0 ? [...currentToolUses] : undefined,
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
        streamingContent: '',
        currentToolUses: [],
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
    streamingContent: '',
    currentToolUses: [],

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
        streamingContent: '',
        currentToolUses: []
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
          streamingContent: '',
          currentToolUses: []
        }))
      }
    },

    cancelMessage: async () => {
      await window.orchestrate.cancelAgentMessage()
    },

    clearConversation: async () => {
      await window.orchestrate.clearAgentConversation()
      set({ messages: [], streamingContent: '', currentToolUses: [] })
    },

    resetState: () => {
      set({
        messages: [],
        isStreaming: false,
        streamingContent: '',
        currentToolUses: [],
        hasApiKey: null
      })
    }
  }
})
