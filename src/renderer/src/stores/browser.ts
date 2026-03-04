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

const DEFAULT_URL = 'http://localhost:3000'

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

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  nextIndex: 1,

  createTab: async (url?: string) => {
    ensureGlobalListeners()
    const { nextIndex } = get()
    const id = `browser-${Date.now()}-${nextIndex}`
    const tabUrl = url ?? DEFAULT_URL

    const tab: BrowserTabInfo = {
      id,
      url: tabUrl,
      title: tabUrl,
      isLoading: true,
      canGoBack: false,
      canGoForward: false
    }

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
      throw err
    }
  },

  closeTab: (id: string) => {
    window.orchestrate.closeBrowserTab(id)
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
    window.orchestrate.closeAllBrowserTabs()
    set({ tabs: [], activeTabId: null })
  },

  navigate: (id: string, url: string) => {
    window.orchestrate.navigateBrowser(id, url)
  },

  goBack: (id: string) => {
    window.orchestrate.browserGoBack(id)
  },

  goForward: (id: string) => {
    window.orchestrate.browserGoForward(id)
  },

  reload: (id: string) => {
    window.orchestrate.browserReload(id)
  },

  stop: (id: string) => {
    window.orchestrate.browserStop(id)
  },

  toggleDevTools: (id: string) => {
    window.orchestrate.toggleBrowserDevTools(id)
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
