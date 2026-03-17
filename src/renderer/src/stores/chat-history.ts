import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { useAgentStore, registerAutoSave } from './agent'
import type { ChatConversationSummary, ChatConversation, ChatMessageData } from '@shared/types'

interface ChatHistoryState {
  conversations: ChatConversationSummary[]
  activeConversationId: string | null
  panelOpen: boolean
  isLoading: boolean

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  saveCurrentConversation: () => Promise<void>
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
}

const PANEL_KEY = 'orchestrate:chatPanelOpen'

function getPanelDefault(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === 'true'
  } catch {
    return false
  }
}

export const useChatHistoryStore = create<ChatHistoryState>((set, get) => {
  // Register the auto-save callback with the agent store
  registerAutoSave(async () => {
    // Use setTimeout to avoid calling saveCurrentConversation synchronously
    // during state updates
    setTimeout(() => {
      get().saveCurrentConversation()
    }, 0)
  })

  return {
    conversations: [],
    activeConversationId: null,
    panelOpen: getPanelDefault(),
    isLoading: false,

    loadConversations: async () => {
      try {
        const conversations = await window.orchestrate.listConversations()
        set({ conversations })
      } catch (err) {
        console.error('[ChatHistory] Failed to load conversations:', err)
      }
    },

    selectConversation: async (id: string) => {
      const { activeConversationId } = get()
      if (activeConversationId === id) return

      // Save current conversation before switching
      await get().saveCurrentConversation()

      set({ isLoading: true })
      try {
        const conv = await window.orchestrate.loadConversation(id)
        if (!conv) {
          set({ isLoading: false })
          return
        }

        // Clear SDK session and load messages into agent store
        await window.orchestrate.clearAgentConversation()
        useAgentStore.getState().loadMessages(conv.messages)
        set({ activeConversationId: id, isLoading: false })
      } catch (err) {
        console.error('[ChatHistory] Failed to load conversation:', err)
        set({ isLoading: false })
      }
    },

    newConversation: async () => {
      // Save current conversation first
      await get().saveCurrentConversation()

      // Clear agent store and SDK session
      await window.orchestrate.clearAgentConversation()
      useAgentStore.setState({ messages: [], streamingItems: [], isStreaming: false })
      set({ activeConversationId: null })
    },

    deleteConversation: async (id: string) => {
      try {
        await window.orchestrate.deleteConversation(id)
        const { activeConversationId } = get()
        if (activeConversationId === id) {
          await window.orchestrate.clearAgentConversation()
          useAgentStore.setState({ messages: [], streamingItems: [], isStreaming: false })
          set({ activeConversationId: null })
        }
        await get().loadConversations()
      } catch (err) {
        console.error('[ChatHistory] Failed to delete conversation:', err)
      }
    },

    renameConversation: async (id: string, title: string) => {
      try {
        await window.orchestrate.renameConversation(id, title)
        await get().loadConversations()
      } catch (err) {
        console.error('[ChatHistory] Failed to rename conversation:', err)
      }
    },

    saveCurrentConversation: async () => {
      const { messages, isStreaming } = useAgentStore.getState()
      if (messages.length === 0 || isStreaming) return

      const { activeConversationId } = get()

      // Build conversation data
      const id = activeConversationId || nanoid(8)
      const firstUserMsg = messages.find((m) => m.role === 'user')
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
        : 'New conversation'

      const now = new Date().toISOString()
      const messageData: ChatMessageData[] = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolUses: m.toolUses,
        items: m.items,
        timestamp: m.timestamp
      }))

      const existingConv = get().conversations.find((c) => c.id === activeConversationId)
      const conversation: ChatConversation = {
        id,
        title: existingConv?.title || title,
        createdAt: existingConv?.createdAt || now,
        updatedAt: now,
        messages: messageData
      }

      try {
        await window.orchestrate.saveConversation(conversation)
        set({ activeConversationId: id })
        await get().loadConversations()
      } catch (err) {
        console.error('[ChatHistory] Failed to save conversation:', err)
      }
    },

    setPanelOpen: (open: boolean) => {
      localStorage.setItem(PANEL_KEY, String(open))
      set({ panelOpen: open })
    },

    togglePanel: () => {
      const next = !get().panelOpen
      localStorage.setItem(PANEL_KEY, String(next))
      set({ panelOpen: next })
    }
  }
})
