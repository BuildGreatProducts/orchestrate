import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from './toast'
import { useAppStore } from './app'

export interface TerminalTab {
  id: string
  name: string
  projectFolder: string
  taskId?: string
  isAgent: boolean
  exited: boolean
  exitCode?: number
  busy: boolean
  bell: boolean
  bellAt?: number
}

export interface AgentGroup {
  id: string
  name: string
  projectFolder: string
  collapsed: boolean
  tabIds: string[]
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  nextIndex: number
  groups: AgentGroup[]
  nextGroupIndex: number
  pendingCloseTabId: string | null

  createTab: (cwd: string, name?: string, command?: string, taskId?: string) => Promise<string>
  getTaskId: (terminalId: string) => string | undefined
  closeTab: (id: string) => void
  requestCloseTab: (id: string) => void
  confirmCloseTab: () => void
  cancelCloseTab: () => void
  setActiveTab: (id: string) => void
  updateTabName: (id: string, name: string) => void
  markBusy: (id: string, busy: boolean) => void
  markBell: (id: string) => void
  clearBell: (id: string) => void
  markExited: (id: string, exitCode: number) => void
  closeAllTabs: () => void

  // Group methods
  createGroup: (name: string | undefined, projectFolder: string) => string
  deleteGroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  moveTabToGroup: (tabId: string, groupId: string, index?: number) => void
  removeTabFromGroup: (tabId: string) => void
  reorderTabInGroup: (groupId: string, oldIndex: number, newIndex: number) => void
  reorderTabs: (oldIndex: number, newIndex: number) => void
  createTabInGroup: (cwd: string, groupId: string, name?: string, command?: string) => Promise<string>
  findOrCreateGroup: (name: string, projectFolder: string) => string
}

// --- Shared IPC dispatcher ---
// Single global listeners forward events to per-terminal callbacks,
// avoiding a growing listener count on ipcRenderer.

const outputSubscribers = new Map<string, Set<(data: string) => void>>()
const exitHandlers = new Map<string, (exitCode: number) => void>()

// --- Output ring buffer ---
// Stores recent output per terminal so mirror terminals can replay history on mount.
// Budget is byte-based to prevent memory bloat from large chunks.
const MAX_OUTPUT_BUFFER_BYTES = 512 * 1024 // 512 KB per terminal
const outputBuffers = new Map<string, { entries: { text: string; bytes: number }[]; totalBytes: number }>()

function appendToBuffer(id: string, data: string): void {
  let buf = outputBuffers.get(id)
  if (!buf) {
    buf = { entries: [], totalBytes: 0 }
    outputBuffers.set(id, buf)
  }
  const bytes = data.length * 2 // approximate: JS strings are UTF-16
  buf.entries.push({ text: data, bytes })
  buf.totalBytes += bytes
  while (buf.totalBytes > MAX_OUTPUT_BUFFER_BYTES && buf.entries.length > 1) {
    const removed = buf.entries.shift()!
    buf.totalBytes -= removed.bytes
  }
}

export function getOutputBuffer(id: string): string {
  const buf = outputBuffers.get(id)
  return buf ? buf.entries.map((e) => e.text).join('') : ''
}

// --- PTY dimensions ---
// Tracks the actual PTY column/row count so mirror terminals can match it.
const ptyDimensions = new Map<string, { cols: number; rows: number }>()

export function setPtyDimensions(id: string, cols: number, rows: number): void {
  ptyDimensions.set(id, { cols, rows })
}

export function getPtyDimensions(id: string): { cols: number; rows: number } | undefined {
  return ptyDimensions.get(id)
}

export function clearOutputBuffer(id: string): void {
  outputBuffers.delete(id)
}

let globalListenersRegistered = false

function ensureGlobalListeners(): void {
  if (globalListenersRegistered) return
  globalListenersRegistered = true

  window.orchestrate.onTerminalOutput((id, data) => {
    appendToBuffer(id, data)
    const subs = outputSubscribers.get(id)
    if (subs) {
      for (const handler of subs) {
        handler(data)
      }
    }
  })

  window.orchestrate.onTerminalExit((id, exitCode) => {
    exitHandlers.get(id)?.(exitCode)
  })
}

/** Subscribe to terminal output. Returns an unsubscribe function. */
export function addOutputSubscriber(id: string, handler: (data: string) => void): () => void {
  ensureGlobalListeners()
  let subs = outputSubscribers.get(id)
  if (!subs) {
    subs = new Set()
    outputSubscribers.set(id, subs)
  }
  subs.add(handler)
  return () => {
    subs!.delete(handler)
    if (subs!.size === 0) {
      outputSubscribers.delete(id)
    }
  }
}

export function registerExitHandler(id: string, handler: (exitCode: number) => void): void {
  ensureGlobalListeners()
  exitHandlers.set(id, handler)
}

export function unregisterTerminalHandlers(id: string): void {
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
  pendingCloseTabId: null,

  createTab: async (cwd: string, name?: string, command?: string, taskId?: string) => {
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
        { id, name: tabName, projectFolder: cwd, taskId, isAgent: !!command, exited: false, busy: false, bell: false }
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
    clearOutputBuffer(id)
    ptyDimensions.delete(id)

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

      return {
        tabs: newTabs,
        activeTabId: newActive,
        groups: newGroups,
        pendingCloseTabId: state.pendingCloseTabId === id ? null : state.pendingCloseTabId
      }
    })
  },

  requestCloseTab: (id: string) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === id)
    // If already exited, close immediately without confirmation
    if (tab?.exited) {
      get().closeTab(id)
      return
    }
    set({ pendingCloseTabId: id })
  },

  confirmCloseTab: () => {
    const { pendingCloseTabId } = get()
    if (pendingCloseTabId) {
      get().closeTab(pendingCloseTabId)
      set({ pendingCloseTabId: null })
    }
  },

  cancelCloseTab: () => {
    set({ pendingCloseTabId: null })
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
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === id)
    if (!tab || tab.exited || tab.bell) return
    // Only suppress if the terminal is truly visible: active tab + terminal view + correct project
    if (id === activeTabId) {
      const appState = useAppStore.getState()
      if (
        appState.contentView.type === 'terminal' &&
        appState.currentFolder === tab.projectFolder
      ) {
        return
      }
    }
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, bell: true, bellAt: Date.now() } : t))
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

  getTaskId: (terminalId: string) => {
    return get().tabs.find((t) => t.id === terminalId)?.taskId
  },

  closeAllTabs: () => {
    const { tabs } = get()
    for (const tab of tabs) {
      if (!tab.exited) {
        window.orchestrate.closeTerminal(tab.id)
      }
      clearOutputBuffer(tab.id)
      ptyDimensions.delete(tab.id)
    }
    set({ tabs: [], activeTabId: null, groups: [], nextGroupIndex: 1, pendingCloseTabId: null })
  },

  // --- Group methods ---

  createGroup: (name: string | undefined, projectFolder: string) => {
    const { nextGroupIndex } = get()
    const id = `group-${Date.now()}-${nextGroupIndex}`
    const groupName = name ?? `Group ${nextGroupIndex}`
    set((state) => ({
      groups: [...state.groups, { id, name: groupName, projectFolder, collapsed: false, tabIds: [] }],
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

  reorderTabs: (oldIndex: number, newIndex: number) => {
    set((state) => ({
      tabs: arrayMove(state.tabs, oldIndex, newIndex)
    }))
  },

  createTabInGroup: async (cwd: string, groupId: string, name?: string, command?: string) => {
    const tabId = await get().createTab(cwd, name, command)
    get().moveTabToGroup(tabId, groupId)
    return tabId
  },

  findOrCreateGroup: (name: string, projectFolder: string) => {
    const existing = get().groups.find((g) => g.name === name && g.projectFolder === projectFolder)
    if (existing) return existing.id
    return get().createGroup(name, projectFolder)
  }
}))
