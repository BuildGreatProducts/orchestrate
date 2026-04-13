import { create } from 'zustand'
import type { ContentView, NavPageId, ProjectDetailTabId } from '@shared/types'

interface AppState {
  contentView: ContentView
  currentFolder: string | null
  projects: string[]
  expandedProjects: Record<string, boolean>
  projectDetailTab: ProjectDetailTabId

  showPage: (pageId: NavPageId) => void
  showOrchestrate: () => void
  showProjectDetail: (folder: string, tab?: ProjectDetailTabId) => Promise<void>
  setProjectDetailTab: (tab: ProjectDetailTabId) => void
  showTerminal: (folder?: string) => Promise<void>
  toggleProjectExpanded: (folder: string) => void
  setProjectExpanded: (folder: string, expanded: boolean) => void
  setCurrentFolder: (folder: string | null) => void
  loadLastFolder: () => Promise<void>
  loadProjects: () => Promise<void>
  addProject: (path: string) => Promise<void>
  removeProject: (path: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  contentView: { type: 'orchestrate' },
  currentFolder: null,
  projects: [],
  expandedProjects: {},
  projectDetailTab: 'tasks',

  showPage: (pageId) => set({ contentView: { type: 'page', pageId } }),

  showOrchestrate: () => {
    set({
      currentFolder: null,
      contentView: { type: 'orchestrate' }
    })
    window.orchestrate.setActiveProject(null)
  },

  showProjectDetail: async (folder, tab) => {
    await window.orchestrate.setActiveProject(folder)
    set({
      currentFolder: folder,
      contentView: { type: 'project-detail' },
      ...(tab ? { projectDetailTab: tab } : {})
    })
  },

  setProjectDetailTab: (tab) => set({ projectDetailTab: tab }),

  showTerminal: async (folder) => {
    if (folder) {
      await window.orchestrate.setActiveProject(folder)
      set({ currentFolder: folder, contentView: { type: 'terminal' } })
    } else {
      set({ contentView: { type: 'terminal' } })
    }
  },

  toggleProjectExpanded: (folder) => {
    set((state) => ({
      expandedProjects: {
        ...state.expandedProjects,
        [folder]: !(state.expandedProjects[folder] ?? true)
      }
    }))
  },

  setProjectExpanded: (folder, expanded) => {
    set((state) => ({
      expandedProjects: {
        ...state.expandedProjects,
        [folder]: expanded
      }
    }))
  },

  setCurrentFolder: async (folder) => {
    if (folder) {
      await window.orchestrate.setActiveProject(folder)
    }
    const state = get()
    // When switching back to a project from Orchestrate, go to project detail
    const contentView =
      state.contentView.type === 'orchestrate'
        ? ({ type: 'project-detail' } as ContentView)
        : state.contentView
    set({ currentFolder: folder, contentView })
  },
  loadLastFolder: async () => {
    const folder = await window.orchestrate.getLastFolder()
    if (folder) {
      set({ currentFolder: folder })
    }
  },
  loadProjects: async () => {
    const projects = await window.orchestrate.getProjects()
    // Default all projects to expanded
    const expandedProjects: Record<string, boolean> = {}
    for (const p of projects) {
      expandedProjects[p] = true
    }
    set({ projects, expandedProjects })
  },
  addProject: async (path) => {
    const projects = await window.orchestrate.addProject(path)
    set((state) => ({
      projects,
      expandedProjects: { ...state.expandedProjects, [path]: true }
    }))
  },
  removeProject: async (path) => {
    const projects = await window.orchestrate.removeProject(path)
    set((state) => {
      const { [path]: _, ...rest } = state.expandedProjects
      return {
        projects,
        expandedProjects: rest,
        ...(state.currentFolder === path ? { currentFolder: null } : {})
      }
    })
  }
}))
