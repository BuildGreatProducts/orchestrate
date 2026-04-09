import { create } from 'zustand'
import type { BrowserTabInfo } from '@shared/types'

interface BrowserState {
  tabs: BrowserTabInfo[]
  activeTabId: string | null
  nextIndex: number

  createTab: (url?: string) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  closeAllTabs: () => void
  navigate: (id: string, url: string) => void
  goBack: (id: string) => void
  goForward: (id: string) => void
  reload: (id: string) => void
  stop: (id: string) => void
  toggleDevTools: (id: string) => void
  updateTab: (info: BrowserTabInfo) => void
  removeTab: (id: string) => void
}

const FALLBACK_URL = 'http://localhost:3000'

async function getDefaultUrl(): Promise<string> {
  try {
    const url = await window.orchestrate.getSetting('defaultBrowserUrl')
    return typeof url === 'string' && url.trim() ? url.trim() : FALLBACK_URL
  } catch {
    return FALLBACK_URL
  }
}

let globalListenersRegistered = false

function ensureGlobalListeners(): void {
  if (globalListenersRegistered) return
  globalListenersRegistered = true

  window.orchestrate.onBrowserTabUpdated((tab) => {
    useBrowserStore.getState().updateTab(tab)
  })

  window.orchestrate.onBrowserTabClosed((id) => {
    useBrowserStore.getState().removeTab(id)
  })
}

// Tracks IDs of in-flight createBrowserTab calls so closeAllTabs can
// invalidate them and prevent stale creations from re-adding tabs.
const pendingCreations = new Set<string>()

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  nextIndex: 1,

  createTab: async (url?: string) => {
    ensureGlobalListeners()
    const { nextIndex } = get()
    const id = `browser-${Date.now()}-${nextIndex}`
    const tabUrl = url ?? await getDefaultUrl()

    const tab: BrowserTabInfo = {
      id,
      url: tabUrl,
      title: tabUrl,
      isLoading: true,
      canGoBack: false,
      canGoForward: false
    }

    pendingCreations.add(id)

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
      nextIndex: state.nextIndex + 1
    }))

    try {
      await window.orchestrate.createBrowserTab(id, tabUrl)
    } catch (err) {
      set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        return {
          tabs: newTabs,
          activeTabId: state.activeTabId === id ? (newTabs.at(-1)?.id ?? null) : state.activeTabId
        }
      })
      pendingCreations.delete(id)
      throw err
    }

    // If closeAllTabs ran while we were awaiting, this creation is stale —
    // clean up the main-process view and remove from local state.
    if (!pendingCreations.has(id)) {
      window.orchestrate.closeBrowserTab(id).catch(() => {})
      set((state) => ({
        tabs: state.tabs.filter((t) => t.id !== id),
        activeTabId: state.activeTabId === id ? null : state.activeTabId
      }))
      return
    }
    pendingCreations.delete(id)
  },

  closeTab: (id: string) => {
    window.orchestrate.closeBrowserTab(id).catch((err) => {
      console.error('[Browser] Failed to close tab:', err)
    })
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

  closeAllTabs: () => {
    // Invalidate any in-flight createTab calls
    pendingCreations.clear()
    window.orchestrate.closeAllBrowserTabs().catch((err) => {
      console.error('[Browser] Failed to close all tabs:', err)
    })
    set({ tabs: [], activeTabId: null })
  },

  navigate: (id: string, url: string) => {
    window.orchestrate.navigateBrowser(id, url).catch((err) => {
      console.error('[Browser] Failed to navigate:', err)
    })
  },

  goBack: (id: string) => {
    window.orchestrate.browserGoBack(id).catch((err) => {
      console.error('[Browser] Failed to go back:', err)
    })
  },

  goForward: (id: string) => {
    window.orchestrate.browserGoForward(id).catch((err) => {
      console.error('[Browser] Failed to go forward:', err)
    })
  },

  reload: (id: string) => {
    window.orchestrate.browserReload(id).catch((err) => {
      console.error('[Browser] Failed to reload:', err)
    })
  },

  stop: (id: string) => {
    window.orchestrate.browserStop(id).catch((err) => {
      console.error('[Browser] Failed to stop:', err)
    })
  },

  toggleDevTools: (id: string) => {
    window.orchestrate.toggleBrowserDevTools(id).catch((err) => {
      console.error('[Browser] Failed to toggle DevTools:', err)
    })
  },

  updateTab: (info: BrowserTabInfo) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === info.id ? info : t))
    }))
  },

  removeTab: (id: string) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id)
      let newActive = state.activeTabId
      if (state.activeTabId === id) {
        const closedIndex = state.tabs.findIndex((t) => t.id === id)
        newActive = newTabs[closedIndex - 1]?.id ?? newTabs[closedIndex]?.id ?? null
      }
      return { tabs: newTabs, activeTabId: newActive }
    })
  }
}))
