import { create } from 'zustand'
import type { TabId } from '@shared/types'

interface AppState {
  activeTab: TabId
  currentFolder: string | null
  showSettings: boolean
  setActiveTab: (tab: TabId) => void
  setCurrentFolder: (folder: string | null) => void
  setShowSettings: (show: boolean) => void
  loadLastFolder: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'orchestrate',
  currentFolder: null,
  showSettings: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  setShowSettings: (show) => set({ showSettings: show }),
  loadLastFolder: async () => {
    const folder = await window.orchestrate.getLastFolder()
    if (folder) {
      set({ currentFolder: folder })
    }
  }
}))
