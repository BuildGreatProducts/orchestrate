import { create } from 'zustand'
import type { TabId } from '@shared/types'

interface AppState {
  activeTab: TabId
  currentFolder: string | null
  projects: string[]
  showSettings: boolean
  setActiveTab: (tab: TabId) => void
  setCurrentFolder: (folder: string | null) => void
  setShowSettings: (show: boolean) => void
  loadLastFolder: () => Promise<void>
  loadProjects: () => Promise<void>
  addProject: (path: string) => Promise<void>
  removeProject: (path: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'orchestrate',
  currentFolder: null,
  projects: [],
  showSettings: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentFolder: async (folder) => {
    if (folder) {
      await window.orchestrate.setActiveProject(folder)
    }
    set({ currentFolder: folder })
  },
  setShowSettings: (show) => set({ showSettings: show }),
  loadLastFolder: async () => {
    const folder = await window.orchestrate.getLastFolder()
    if (folder) {
      set({ currentFolder: folder })
    }
  },
  loadProjects: async () => {
    const projects = await window.orchestrate.getProjects()
    set({ projects })
  },
  addProject: async (path) => {
    const projects = await window.orchestrate.addProject(path)
    set({ projects })
  },
  removeProject: async (path) => {
    const projects = await window.orchestrate.removeProject(path)
    set({ projects })
    if (get().currentFolder === path) {
      set({ currentFolder: null })
    }
  }
}))
