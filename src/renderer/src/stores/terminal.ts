import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from './toast'

export interface TerminalTab {
  id: string
  name: string
  exited: boolean
  exitCode?: number
  busy: boolean
  bell: boolean
}

export interface AgentGroup {
  id: string
  name: string
  collapsed: boolean
  tabIds: string[]
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  nextIndex: number
  groups: AgentGroup[]
  nextGroupIndex: number

  createTab: (cwd: string, name?: string, command?: string) => Promise<string>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabName: (id: string, name: string) => void
  markBusy: (id: string, busy: boolean) => void
  markBell: (id: string) => void
  clearBell: (id: string) => void
  markExited: (id: string, exitCode: number) => void
  closeAllTabs: () => void

  // Group methods
  createGroup: (name?: string) => string
  deleteGroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  moveTabToGroup: (tabId: string, groupId: string, index?: number) => void
  removeTabFromGroup: (tabId: string) => void
  reorderTabInGroup: (groupId: string, oldIndex: number, newIndex: number) => void
  createTabInGroup: (cwd: string, groupId: string, name?: string) => Promise<string>
}

// --- Shared IPC dispatcher ---
// Single global listeners forward events to per-terminal callbacks,
// avoiding a growing listener count on ipcRenderer.

const outputHandlers = new Map<string, (data: string) => void>()
const exitHandlers = new Map<string, (exitCode: number) => void>()

let globalListenersRegistered = false

function ensureGlobalListeners(): void {
  if (globalListenersRegistered) return
  globalListenersRegistered = true

  window.orchestrate.onTerminalOutput((id, data) => {
    outputHandlers.get(id)?.(data)
  })

  window.orchestrate.onTerminalExit((id, exitCode) => {
    exitHandlers.get(id)?.(exitCode)
  })
}

export function registerOutputHandler(id: string, handler: (data: string) => void): void {
  ensureGlobalListeners()
  outputHandlers.set(id, handler)
}

export function registerExitHandler(id: string, handler: (exitCode: number) => void): void {
  ensureGlobalListeners()
  exitHandlers.set(id, handler)
}

export function unregisterTerminalHandlers(id: string): void {
  outputHandlers.delete(id)
  exitHandlers.delete(id)
}

// --- Readiness handshake ---
// createTab waits for the TerminalPane to mount and register its
// IPC handlers before telling the main process to spawn the PTY.

const readyResolvers = new Map<string, () => void>()

export function signalTerminalReady(id: string): void {
  readyResolvers.get(id)?.()
  readyResolvers.delete(id)
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  nextIndex: 1,
  groups: [],
  nextGroupIndex: 1,

  createTab: async (cwd: string, name?: string, command?: string) => {
    const { nextIndex } = get()
    const id = `terminal-${Date.now()}-${nextIndex}`
    const tabName = name ?? `Terminal ${nextIndex}`

    // Create a promise that resolves when TerminalPane signals ready
    const readyPromise = new Promise<void>((resolve) => {
      readyResolvers.set(id, resolve)
    })

    // Add tab to state FIRST so the component mounts and registers
    // its handlers before the PTY starts emitting
    set((state) => ({
      tabs: [
        ...state.tabs,
        { id, name: tabName, exited: false, busy: false, bell: false }
      ],
      activeTabId: id,
      nextIndex: state.nextIndex + 1
    }))

    // Wait for TerminalPane to mount and register its IPC handlers
    await readyPromise

    try {
      await window.orchestrate.createTerminal(id, cwd, command)
    } catch (err) {
      // Remove the orphaned tab on failure
      set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        return {
          tabs: newTabs,
          activeTabId: state.activeTabId === id ? (newTabs.at(-1)?.id ?? null) : state.activeTabId
        }
      })
      toast.error(`Failed to create terminal: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }

    return id
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

      // Remove from any group
      const newGroups = state.groups.map((g) =>
        g.tabIds.includes(id) ? { ...g, tabIds: g.tabIds.filter((t) => t !== id) } : g
      )

      return { tabs: newTabs, activeTabId: newActive, groups: newGroups }
    })
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  updateTabName: (id: string, name: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t))
    }))
  },

  markBusy: (id: string, busy: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, busy } : t))
    }))
  },

  markBell: (id: string) => {
    const { activeTabId } = get()
    // Only show bell if the tab isn't currently active
    if (id === activeTabId) return
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, bell: true } : t))
    }))
  },

  clearBell: (id: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, bell: false } : t))
    }))
  },

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
    set({ tabs: [], activeTabId: null, groups: [], nextGroupIndex: 1 })
  },

  // --- Group methods ---

  createGroup: (name?: string) => {
    const { nextGroupIndex } = get()
    const id = `group-${Date.now()}-${nextGroupIndex}`
    const groupName = name ?? `Group ${nextGroupIndex}`
    set((state) => ({
      groups: [...state.groups, { id, name: groupName, collapsed: false, tabIds: [] }],
      nextGroupIndex: state.nextGroupIndex + 1
    }))
    return id
  },

  deleteGroup: (groupId: string) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId)
    }))
  },

  renameGroup: (groupId: string, name: string) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g))
    }))
  },

  toggleGroupCollapsed: (groupId: string) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
      )
    }))
  },

  moveTabToGroup: (tabId: string, groupId: string, index?: number) => {
    set((state) => {
      // Remove from any existing group
      let groups = state.groups.map((g) =>
        g.tabIds.includes(tabId) ? { ...g, tabIds: g.tabIds.filter((t) => t !== tabId) } : g
      )
      // Add to target group
      groups = groups.map((g) => {
        if (g.id !== groupId) return g
        const newTabIds = [...g.tabIds]
        if (index !== undefined && index >= 0 && index <= newTabIds.length) {
          newTabIds.splice(index, 0, tabId)
        } else {
          newTabIds.push(tabId)
        }
        return { ...g, tabIds: newTabIds }
      })
      return { groups }
    })
  },

  removeTabFromGroup: (tabId: string) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.tabIds.includes(tabId) ? { ...g, tabIds: g.tabIds.filter((t) => t !== tabId) } : g
      )
    }))
  },

  reorderTabInGroup: (groupId: string, oldIndex: number, newIndex: number) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, tabIds: arrayMove(g.tabIds, oldIndex, newIndex) } : g
      )
    }))
  },

  createTabInGroup: async (cwd: string, groupId: string, name?: string) => {
    const tabId = await get().createTab(cwd, name)
    get().moveTabToGroup(tabId, groupId)
    return tabId
  }
}))
