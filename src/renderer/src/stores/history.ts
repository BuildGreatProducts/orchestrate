import { create } from 'zustand'
import type { SavePointDetail, GitStatus, CommitNode, BranchInfo } from '@shared/types'
import { useFilesStore } from './files'
import { toast } from './toast'

interface HistoryState {
  isGitRepo: boolean | null
  gitStatus: GitStatus | null
  isLoading: boolean
  hasLoaded: boolean

  expandedDetail: SavePointDetail | null
  detailLoading: boolean

  diffModal: { hash: string; filePath: string; before: string; after: string } | null
  confirmRevert: string | null
  confirmRestore: string | null
  showUncommittedDialog: boolean

  fileStatusMap: Record<string, 'M' | 'A' | 'D' | '?'>

  // Branch graph state
  commitGraph: CommitNode[]
  branches: BranchInfo[]
  selectedBranch: string | null
  graphLoading: boolean
  selectedCommitHash: string | null
  hoveredCommitHash: string | null

  checkIsRepo: () => Promise<void>
  loadStatus: () => Promise<void>
  refreshAll: () => Promise<void>
  initRepo: () => Promise<void>
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
  loadCommitGraph: () => Promise<void>
  loadBranches: () => Promise<void>
  setSelectedBranch: (branch: string | null) => void
  selectCommit: (hash: string | null) => Promise<void>
  setHoveredCommit: (hash: string | null) => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  isGitRepo: null,
  gitStatus: null,
  isLoading: false,
  hasLoaded: false,

  expandedDetail: null,
  detailLoading: false,

  diffModal: null,
  confirmRevert: null,
  confirmRestore: null,
  showUncommittedDialog: false,

  fileStatusMap: {},

  // Branch graph defaults
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
    const { loadStatus, loadCommitGraph, loadBranches } = get()
    await Promise.all([loadStatus(), loadCommitGraph(), loadBranches()])
    useFilesStore.getState().refreshTree()
    set({ isLoading: false, hasLoaded: true })
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
      gitStatus: null,
      isLoading: false,
      hasLoaded: false,
      expandedDetail: null,
      detailLoading: false,
      diffModal: null,
      confirmRevert: null,
      confirmRestore: null,
      showUncommittedDialog: false,
      fileStatusMap: {},
      commitGraph: [],
      branches: [],
      selectedBranch: null,
      graphLoading: false,
      selectedCommitHash: null,
      hoveredCommitHash: null
    })
}))
