import { create } from 'zustand'
import type { ContentView, NavPageId } from '@shared/types'

interface AppState {
  contentView: ContentView
  currentFolder: string | null
  projects: string[]

  showPage: (pageId: NavPageId) => void
  showTerminal: () => void
  setCurrentFolder: (folder: string | null) => void
  loadLastFolder: () => Promise<void>
  loadProjects: () => Promise<void>
  addProject: (path: string) => Promise<void>
  removeProject: (path: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  contentView: { type: 'page', pageId: 'tasks' },
  currentFolder: null,
  projects: [],

  showPage: (pageId) => set({ contentView: { type: 'page', pageId } }),
  showTerminal: () => set({ contentView: { type: 'terminal' } }),

  setCurrentFolder: async (folder) => {
    if (folder) {
      await window.orchestrate.setActiveProject(folder)
    }
    set({ currentFolder: folder })
  },
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
