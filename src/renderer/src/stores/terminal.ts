import { create } from 'zustand'
import { toast } from './toast'

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
      tabs: [...state.tabs, { id, name: tabName, exited: false }],
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
