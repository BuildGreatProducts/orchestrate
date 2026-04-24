import { create } from 'zustand'
import { ipc } from '@electron-toolkit/utils'

interface TerminalTab {
  id: string
  title: string
  cwd: string
  activeProject: string | null
}

interface TerminalTabsState {
  tabs: TerminalTab[]
  activeTabId: string | null
  loadTabs: () => Promise<void>
  createTab: (cwd?: string) => Promise<TerminalTab>
  updateTab: (id: string, updates: Partial<TerminalTab>) => Promise<void>
  deleteTab: (id: string) => Promise<void>
  setActiveTab: (id: string) => void
}

export const useTerminalTabsStore = create<TerminalTabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  loadTabs: async () => {
    const tabs = await ipc.invoke('terminal:get-tabs')
    set({
      tabs: tabs || [],
      activeTabId: tabs?.[0]?.id || null,
    })
  },

  createTab: async (cwd) => {
    const newTab = await ipc.invoke('terminal:create-tab', cwd)
    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }))
    return newTab
  },

  updateTab: async (id, updates) => {
    await ipc.invoke('terminal:update-tab', id, updates)
    set(state => ({
      tabs: state.tabs.map(t => t.id === id ? { ...t, ...updates } : t),
    }))
  },

  deleteTab: async (id) => {
    await ipc.invoke('terminal:delete-tab', id)
    const state = get()
    const newTabs = state.tabs.filter(t => t.id !== id)
    set({
      tabs: newTabs,
      activeTabId: state.activeTabId === id ? newTabs[0]?.id || null : state.activeTabId,
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),
}))