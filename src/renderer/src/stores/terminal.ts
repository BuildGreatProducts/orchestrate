import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from './toast'
import { useAppStore } from './app'

export type TerminalKind = 'agent' | 'terminal' | 'command'
export type TerminalLaunchMode = 'direct' | 'worktree'

export interface CreateTerminalOptions {
  cwd: string
  name?: string
  command?: string
  kind?: TerminalKind
  branchName?: string
  launchMode?: TerminalLaunchMode
  taskId?: string
  worktreePath?: string
  groupId?: string
}

export interface TerminalTab {
  id: string
  name: string
  projectFolder: string
  worktreePath?: string
  taskId?: string
  kind: TerminalKind
  isAgent: boolean
  branchName?: string
  launchMode?: TerminalLaunchMode
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

  createTab: (
    optionsOrCwd: CreateTerminalOptions | string,
    name?: string,
    command?: string,
    taskId?: string,
    worktreePath?: string,
    groupId?: string
  ) => Promise<string>
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
  createTabInGroup: (cwd: string, groupId: string, name?: string, command?: string, worktreePath?: string) => Promise<string>
  findOrCreateGroup: (name: string, projectFolder: string) => string
}

// --- Shared IPC dispatcher ---
// Single global listeners forward events to per-terminal callbacks,
// avoiding a growing listener count on ipcRenderer.

const outputSubscribers = new Map<string, Set<(data: string) => void>>()
const exitHandlers = new Map<string, (exitCode: number) => void>()
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const attentionTimers = new Map<string, ReturnType<typeof setTimeout>>()
const bellClearTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
  while (buf.totalBytes > MAX_OUTPUT_BUFFER_BYTES) {
    if (buf.entries.length > 1) {
      const removed = buf.entries.shift()!
      buf.totalBytes -= removed.bytes
    } else {
      // Single oversized entry — truncate to fit
      const entry = buf.entries[0]
      const maxChars = Math.floor(MAX_OUTPUT_BUFFER_BYTES / 2)
      entry.text = entry.text.slice(-maxChars)
      entry.bytes = entry.text.length * 2
      buf.totalBytes = entry.bytes
      break
    }
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

function broadcastOutput(id: string, data: string): void {
  appendToBuffer(id, data)
  const subs = outputSubscribers.get(id)
  if (subs) {
    for (const handler of subs) {
      handler(data)
    }
  }
}

function clearLifecycleTimers(id: string): void {
  const idleTimer = idleTimers.get(id)
  if (idleTimer) clearTimeout(idleTimer)
  idleTimers.delete(id)

  const attentionTimer = attentionTimers.get(id)
  if (attentionTimer) clearTimeout(attentionTimer)
  attentionTimers.delete(id)

  const bellClearTimer = bellClearTimers.get(id)
  if (bellClearTimer) clearTimeout(bellClearTimer)
  bellClearTimers.delete(id)
}

let globalListenersRegistered = false

function ensureGlobalListeners(): void {
  if (globalListenersRegistered) return
  globalListenersRegistered = true

  window.orchestrate.onTerminalOutput((id, data) => {
    broadcastOutput(id, data)

    const store = useTerminalStore.getState()
    const tab = store.tabs.find((t) => t.id === id)
    if (!tab || tab.exited) return

    if (data.includes('\x07')) {
      store.markBell(id)
    }

    if (!tab.busy) {
      store.markBusy(id, true)
    }

    const existingIdleTimer = idleTimers.get(id)
    if (existingIdleTimer) clearTimeout(existingIdleTimer)
    idleTimers.set(id, setTimeout(() => {
      useTerminalStore.getState().markBusy(id, false)
      const bellClearTimer = bellClearTimers.get(id)
      if (bellClearTimer) {
        clearTimeout(bellClearTimer)
        bellClearTimers.delete(id)
      }
    }, 800))

    if (tab.kind === 'agent') {
      const existingAttentionTimer = attentionTimers.get(id)
      if (existingAttentionTimer) clearTimeout(existingAttentionTimer)
      attentionTimers.set(id, setTimeout(() => {
        const s = useTerminalStore.getState()
        const t = s.tabs.find((item) => item.id === id)
        if (t && t.kind === 'agent' && !t.exited) {
          s.markBell(id)
        }
      }, 3000))
    }

    if (tab.bell && !bellClearTimers.has(id)) {
      bellClearTimers.set(id, setTimeout(() => {
        useTerminalStore.getState().clearBell(id)
        bellClearTimers.delete(id)
      }, 2000))
    }
  })

  window.orchestrate.onTerminalExit((id, exitCode) => {
    clearLifecycleTimers(id)
    const tab = useTerminalStore.getState().tabs.find((item) => item.id === id)
    if (!tab) return
    broadcastOutput(id, `\r\n\x1b[38;5;242m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
    useTerminalStore.getState().markBusy(id, false)
    useTerminalStore.getState().markExited(id, exitCode)
    exitHandlers.get(id)?.(exitCode)
    import('./task-terminal-bridge')
      .then(({ handleTaskTerminalExit }) => handleTaskTerminalExit(id, exitCode))
      .catch((err) => {
        console.error('[Terminal] Failed to run task terminal exit bridge:', err)
      })
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

  createTab: async (optionsOrCwd, name, command, taskId, worktreePath, groupId) => {
    ensureGlobalListeners()
    const options: CreateTerminalOptions =
      typeof optionsOrCwd === 'string'
        ? { cwd: optionsOrCwd, name, command, taskId, worktreePath, groupId }
        : optionsOrCwd
    const { nextIndex } = get()
    const id = `terminal-${Date.now()}-${nextIndex}`
    const kind: TerminalKind = options.kind ?? (options.command ? 'agent' : 'terminal')
    const tabName = options.name ?? (kind === 'agent' ? `Agent ${nextIndex}` : `Terminal ${nextIndex}`)

    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id,
          name: tabName,
          projectFolder: options.cwd,
          worktreePath: options.worktreePath,
          taskId: options.taskId,
          kind,
          isAgent: kind === 'agent',
          branchName: options.branchName,
          launchMode: options.launchMode,
          exited: false,
          busy: false,
          bell: false
        }
      ],
      activeTabId: id,
      nextIndex: state.nextIndex + 1,
      ...(options.groupId ? {
        groups: state.groups.map((g) =>
          g.id === options.groupId ? { ...g, tabIds: [...g.tabIds, id] } : g
        )
      } : {})
    }))

    if (kind === 'agent') {
      attentionTimers.set(id, setTimeout(() => {
        const s = useTerminalStore.getState()
        const t = s.tabs.find((tab) => tab.id === id)
        if (t && t.kind === 'agent' && !t.exited) {
          s.markBell(id)
        }
      }, 3000))
    }

    const effectiveCwd = options.worktreePath ?? options.cwd
    try {
      await window.orchestrate.createTerminal(id, effectiveCwd, options.command)
    } catch (err) {
      clearLifecycleTimers(id)
      clearOutputBuffer(id)
      // Remove the orphaned tab on failure
      set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        return {
          tabs: newTabs,
          groups: state.groups.map((g) =>
            g.tabIds.includes(id) ? { ...g, tabIds: g.tabIds.filter((t) => t !== id) } : g
          ),
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
    clearLifecycleTimers(id)
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
    // Only suppress non-agent bells when the bottom terminal is visibly focused.
    if (tab.kind !== 'agent' && id === activeTabId) {
      const appState = useAppStore.getState()
      if (
        appState.bottomTerminalOpen &&
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
      clearLifecycleTimers(tab.id)
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

  createTabInGroup: async (cwd: string, groupId: string, name?: string, command?: string, worktreePath?: string) => {
    return get().createTab({ cwd, name, command, worktreePath, groupId })
  },

  findOrCreateGroup: (name: string, projectFolder: string) => {
    const existing = get().groups.find((g) => g.name === name && g.projectFolder === projectFolder)
    if (existing) return existing.id
    return get().createGroup(name, projectFolder)
  }
}))
