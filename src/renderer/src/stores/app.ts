import { create } from 'zustand'
import type { BrowserSnapshot, ContentView, NavPageId, ProjectDetailTabId } from '@shared/types'
import { waitForProjectApiFallback } from './project-api-fallback-lock'

interface BrowserModalSnapshot extends BrowserSnapshot {
  tabId: string
}

interface AppState {
  contentView: ContentView
  currentFolder: string | null
  projects: string[]
  expandedProjects: Record<string, boolean>
  projectDetailTab: ProjectDetailTabId
  bottomTerminalOpen: boolean
  tasksSidebarOpen: boolean
  modalLayerDepth: number
  browserModalSnapshot: BrowserModalSnapshot | null

  showPage: (pageId: NavPageId) => void
  showOrchestrate: () => Promise<void>
  showProjectDetail: (folder: string, tab?: ProjectDetailTabId) => Promise<void>
  setProjectDetailTab: (tab: ProjectDetailTabId) => void
  showWorktreeDetail: (folder: string, worktreePath: string) => Promise<void>
  showTerminal: (folder?: string) => Promise<void>
  toggleBottomTerminal: () => void
  setBottomTerminalOpen: (open: boolean) => void
  toggleTasksSidebar: () => void
  setTasksSidebarOpen: (open: boolean) => void
  openModalLayer: () => void
  closeModalLayer: () => void
  setBrowserModalSnapshot: (snapshot: BrowserModalSnapshot | null) => void
  toggleProjectExpanded: (folder: string) => void
  setProjectExpanded: (folder: string, expanded: boolean) => void
  setCurrentFolder: (folder: string | null) => Promise<void>
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
  projectDetailTab: 'browser',
  bottomTerminalOpen: true,
  tasksSidebarOpen: true,
  modalLayerDepth: 0,
  browserModalSnapshot: null,

  showPage: (pageId) => set({ contentView: { type: 'page', pageId } }),

  showOrchestrate: async () => {
    await waitForProjectApiFallback()
    set({
      currentFolder: null,
      contentView: { type: 'orchestrate' }
    })
    await window.orchestrate.setActiveProject(null)
  },

  showProjectDetail: async (folder, tab) => {
    await waitForProjectApiFallback()
    await window.orchestrate.setActiveProject(folder)
    set({
      currentFolder: folder,
      contentView: { type: 'project-detail' },
      ...(tab ? { projectDetailTab: tab } : {})
    })
  },

  setProjectDetailTab: (tab) => set({ projectDetailTab: tab }),

  showWorktreeDetail: async (folder, worktreePath) => {
    await waitForProjectApiFallback()
    await window.orchestrate.setActiveProject(folder)
    set({ currentFolder: folder, contentView: { type: 'worktree-detail', worktreePath } })
  },

  showTerminal: async (folder) => {
    if (folder) {
      await waitForProjectApiFallback()
      await window.orchestrate.setActiveProject(folder)
      set((state) => ({
        currentFolder: folder,
        bottomTerminalOpen: true,
        contentView:
          state.contentView.type === 'orchestrate' ? { type: 'project-detail' } : state.contentView
      }))
    } else {
      set({ bottomTerminalOpen: true })
    }
  },

  toggleBottomTerminal: () => set((state) => ({ bottomTerminalOpen: !state.bottomTerminalOpen })),

  setBottomTerminalOpen: (open) => set({ bottomTerminalOpen: open }),

  toggleTasksSidebar: () => set((state) => ({ tasksSidebarOpen: !state.tasksSidebarOpen })),

  setTasksSidebarOpen: (open) => set({ tasksSidebarOpen: open }),

  openModalLayer: () => set((state) => ({ modalLayerDepth: state.modalLayerDepth + 1 })),

  closeModalLayer: () =>
    set((state) => {
      const modalLayerDepth = Math.max(0, state.modalLayerDepth - 1)
      return {
        modalLayerDepth,
        ...(modalLayerDepth === 0 ? { browserModalSnapshot: null } : {})
      }
    }),

  setBrowserModalSnapshot: (snapshot) => set({ browserModalSnapshot: snapshot }),

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
    await waitForProjectApiFallback()
    await window.orchestrate.setActiveProject(folder)
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
    const wasActive = get().currentFolder === path
    set((state) => {
      const rest = { ...state.expandedProjects }
      delete rest[path]
      return {
        projects,
        expandedProjects: rest,
        ...(state.currentFolder === path ? { currentFolder: null } : {})
      }
    })
    if (wasActive) {
      await waitForProjectApiFallback()
      await window.orchestrate.setActiveProject(null)
    }
  }
}))
