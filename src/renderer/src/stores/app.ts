import { create } from 'zustand'
import type { TabId } from '@shared/types'

interface AppState {
  activeTab: TabId
  currentFolder: string | null
  setActiveTab: (tab: TabId) => void
  setCurrentFolder: (folder: string | null) => void
  loadLastFolder: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'manage',
  currentFolder: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  loadLastFolder: async () => {
    const folder = await window.orchestrate.getLastFolder()
    if (folder) {
      set({ currentFolder: folder })
    }
  }
}))
