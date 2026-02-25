import { create } from 'zustand'

interface TerminalTab {
  id: string
  name: string
  exited: boolean
  exitCode?: number
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  nextIndex: number

  createTab: (cwd: string, name?: string, command?: string) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  markExited: (id: string, exitCode: number) => void
  closeAllTabs: () => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  nextIndex: 1,

  createTab: async (cwd: string, name?: string, command?: string) => {
    const { nextIndex } = get()
    const id = `terminal-${Date.now()}-${nextIndex}`
    const tabName = name ?? `Terminal ${nextIndex}`

    // Add tab to state FIRST so the component mounts and registers
    // its onTerminalOutput listener before the PTY starts emitting
    set((state) => ({
      tabs: [...state.tabs, { id, name: tabName, exited: false }],
      activeTabId: id,
      nextIndex: state.nextIndex + 1
    }))

    // Small yield to let React render the TerminalPane and wire up IPC listeners
    await new Promise((resolve) => requestAnimationFrame(resolve))

    await window.orchestrate.createTerminal(id, cwd, command)
  },

  closeTab: (id: string) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === id)
    if (tab && !tab.exited) {
      window.orchestrate.closeTerminal(id)
    }

    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id)
      let newActive = state.activeTabId

      if (state.activeTabId === id) {
        const closedIndex = state.tabs.findIndex((t) => t.id === id)
        newActive = newTabs[closedIndex - 1]?.id ?? newTabs[closedIndex]?.id ?? null
      }

      return { tabs: newTabs, activeTabId: newActive }
    })
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  markExited: (id: string, exitCode: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, exited: true, exitCode } : t))
    }))
  },

  closeAllTabs: () => {
    const { tabs } = get()
    for (const tab of tabs) {
      if (!tab.exited) {
        window.orchestrate.closeTerminal(tab.id)
      }
    }
    set({ tabs: [], activeTabId: null })
  }
}))
