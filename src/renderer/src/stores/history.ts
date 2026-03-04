import { create } from 'zustand'
import type { SavePoint, SavePointDetail, GitStatus, CommitNode, BranchInfo } from '@shared/types'
import { useFilesStore } from './files'
import { toast } from './toast'

export type ViewMode = 'savepoints' | 'graph'

interface HistoryState {
  isGitRepo: boolean | null
  history: SavePoint[]
  gitStatus: GitStatus | null
  isLoading: boolean
  hasLoaded: boolean

  expandedHash: string | null
  expandedDetail: SavePointDetail | null
  detailLoading: boolean

  diffModal: { hash: string; filePath: string; before: string; after: string } | null
  confirmRevert: string | null
  confirmRestore: string | null
  showUncommittedDialog: boolean

  fileStatusMap: Record<string, 'M' | 'A' | 'D' | '?'>

  // Branch graph state
  viewMode: ViewMode
  commitGraph: CommitNode[]
  branches: BranchInfo[]
  selectedBranch: string | null
  graphLoading: boolean
  selectedCommitHash: string | null
  hoveredCommitHash: string | null

  checkIsRepo: () => Promise<void>
  loadHistory: () => Promise<void>
  loadStatus: () => Promise<void>
  refreshAll: () => Promise<void>
  initRepo: () => Promise<void>
  createSavePoint: (message: string) => Promise<void>
  toggleDetail: (hash: string) => Promise<void>
  openDiff: (hash: string, filePath: string) => Promise<void>
  closeDiff: () => void
  requestRevert: (hash: string) => void
  confirmAndRevert: () => Promise<void>
  cancelRevert: () => void
  requestRestore: (hash: string) => Promise<void>
  confirmAndRestore: () => Promise<void>
  cancelRestore: () => void
  dismissUncommittedDialog: () => void
  resetState: () => void

  // Branch graph actions
  setViewMode: (mode: ViewMode) => void
  loadCommitGraph: () => Promise<void>
  loadBranches: () => Promise<void>
  setSelectedBranch: (branch: string | null) => void
  selectCommit: (hash: string | null) => Promise<void>
  setHoveredCommit: (hash: string | null) => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  isGitRepo: null,
  history: [],
  gitStatus: null,
  isLoading: false,
  hasLoaded: false,

  expandedHash: null,
  expandedDetail: null,
  detailLoading: false,

  diffModal: null,
  confirmRevert: null,
  confirmRestore: null,
  showUncommittedDialog: false,

  fileStatusMap: {},

  // Branch graph defaults
  viewMode: 'savepoints',
  commitGraph: [],
  branches: [],
  selectedBranch: null,
  graphLoading: false,
  selectedCommitHash: null,
  hoveredCommitHash: null,

  checkIsRepo: async () => {
    try {
      const isRepo = await window.orchestrate.isGitRepo()
      set({ isGitRepo: isRepo })
    } catch {
      set({ isGitRepo: false })
    }
  },

  loadHistory: async () => {
    try {
      const history = await window.orchestrate.getHistory()
      set({ history, hasLoaded: true })
    } catch (err) {
      console.error('[History] Failed to load history:', err)
      toast.error('Failed to load git history')
      set({ history: [], hasLoaded: true })
    }
  },

  loadStatus: async () => {
    try {
      const status = await window.orchestrate.getStatus()
      const map: Record<string, 'M' | 'A' | 'D' | '?'> = {}
      for (const f of status.modified) map[f] = 'M'
      for (const f of status.added) map[f] = 'A'
      for (const f of status.deleted) map[f] = 'D'
      for (const f of status.untracked) map[f] = '?'
      set({ gitStatus: status, fileStatusMap: map })
    } catch (err) {
      console.error('[History] Failed to load status:', err)
      set({ gitStatus: null, fileStatusMap: {} })
    }
  },

  refreshAll: async () => {
    set({ isLoading: true })
    const { loadHistory, loadStatus, viewMode, loadCommitGraph, loadBranches } = get()
    const fetches: Promise<void>[] = [loadHistory(), loadStatus()]
    if (viewMode === 'graph') {
      fetches.push(loadCommitGraph(), loadBranches())
    }
    await Promise.all(fetches)
    useFilesStore.getState().refreshTree()
    set({ isLoading: false })
  },

  initRepo: async () => {
    try {
      await window.orchestrate.initRepo()
      set({ isGitRepo: true })
      await get().refreshAll()
    } catch (err) {
      console.error('[History] Failed to init repo:', err)
    }
  },

  createSavePoint: async (message: string) => {
    try {
      await window.orchestrate.createSavePoint(message)
      toast.success('Save point created')
      await get().refreshAll()
    } catch (err) {
      toast.error(`Failed to create save point: ${err instanceof Error ? err.message : String(err)}`)
    }
  },

  toggleDetail: async (hash: string) => {
    const { expandedHash } = get()
    if (expandedHash === hash) {
      set({ expandedHash: null, expandedDetail: null })
      return
    }

    set({ expandedHash: hash, detailLoading: true, expandedDetail: null })
    try {
      const detail = await window.orchestrate.getSavePointDetail(hash)
      // Guard against stale responses: only apply if this hash is still expanded
      if (get().expandedHash === hash) {
        set({ expandedDetail: detail, detailLoading: false })
      }
    } catch (err) {
      console.error('[History] Failed to load detail:', err)
      if (get().expandedHash === hash) {
        set({ detailLoading: false })
      }
    }
  },

  openDiff: async (hash: string, filePath: string) => {
    try {
      const result = await window.orchestrate.getSavePointDiff(hash, filePath)
      set({
        diffModal: {
          hash,
          filePath,
          before: result.before,
          after: result.after
        }
      })
    } catch (err) {
      console.error('[History] Failed to load diff:', err)
    }
  },

  closeDiff: () => set({ diffModal: null }),

  requestRevert: (hash: string) => set({ confirmRevert: hash }),

  confirmAndRevert: async () => {
    const { confirmRevert } = get()
    if (!confirmRevert) return

    try {
      await window.orchestrate.revertSavePoint(confirmRevert)
      set({ confirmRevert: null })
      toast.success('Revert completed')
      await get().refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err) || 'Unknown error'
      if (message.includes('REVERT_CONFLICT')) {
        toast.error('Revert failed due to a conflict')
      } else {
        toast.error(`Revert failed: ${message}`)
      }
      set({ confirmRevert: null })
    }
  },

  cancelRevert: () => set({ confirmRevert: null }),

  requestRestore: async (hash: string) => {
    try {
      const hasChanges = await window.orchestrate.hasUncommittedChanges()
      if (hasChanges) {
        set({ showUncommittedDialog: true })
      } else {
        set({ confirmRestore: hash })
      }
    } catch (err) {
      console.error('[History] Failed to check uncommitted changes:', err)
    }
  },

  confirmAndRestore: async () => {
    const { confirmRestore } = get()
    if (!confirmRestore) return

    try {
      await window.orchestrate.restoreToSavePoint(confirmRestore)
      set({ confirmRestore: null })
      toast.success('Restore completed')
      await get().refreshAll()
    } catch (err) {
      console.error('[History] Failed to restore:', err)
      toast.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
      set({ confirmRestore: null })
    }
  },

  cancelRestore: () => set({ confirmRestore: null }),

  dismissUncommittedDialog: () => set({ showUncommittedDialog: false }),

  // Branch graph actions
  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode })
    if (mode === 'graph') {
      const { commitGraph, branches } = get()
      if (commitGraph.length === 0) {
        get().loadCommitGraph()
      }
      if (branches.length === 0) {
        get().loadBranches()
      }
    }
  },

  loadCommitGraph: async () => {
    set({ graphLoading: true })
    try {
      const { selectedBranch } = get()
      const commits = await window.orchestrate.getCommitGraph(
        100,
        selectedBranch ?? undefined
      )
      set({ commitGraph: commits, graphLoading: false })
    } catch (err) {
      console.error('[History] Failed to load commit graph:', err)
      set({ commitGraph: [], graphLoading: false })
    }
  },

  loadBranches: async () => {
    try {
      const branches = await window.orchestrate.getBranches()
      set({ branches })
    } catch (err) {
      console.error('[History] Failed to load branches:', err)
      set({ branches: [] })
    }
  },

  setSelectedBranch: (branch: string | null) => {
    set({ selectedBranch: branch, selectedCommitHash: null })
    get().loadCommitGraph()
  },

  selectCommit: async (hash: string | null) => {
    if (!hash) {
      set({ selectedCommitHash: null, expandedDetail: null })
      return
    }
    set({ selectedCommitHash: hash, detailLoading: true, expandedDetail: null })
    try {
      const detail = await window.orchestrate.getSavePointDetail(hash)
      if (get().selectedCommitHash === hash) {
        set({ expandedDetail: detail, detailLoading: false })
      }
    } catch (err) {
      console.error('[History] Failed to load commit detail:', err)
      if (get().selectedCommitHash === hash) {
        set({ detailLoading: false })
      }
    }
  },

  setHoveredCommit: (hash: string | null) => set({ hoveredCommitHash: hash }),

  resetState: () =>
    set({
      isGitRepo: null,
      history: [],
      gitStatus: null,
      isLoading: false,
      hasLoaded: false,
      expandedHash: null,
      expandedDetail: null,
      detailLoading: false,
      diffModal: null,
      confirmRevert: null,
      confirmRestore: null,
      showUncommittedDialog: false,
      fileStatusMap: {},
      viewMode: 'savepoints',
      commitGraph: [],
      branches: [],
      selectedBranch: null,
      graphLoading: false,
      selectedCommitHash: null,
      hoveredCommitHash: null
    })
}))
