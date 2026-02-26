import { create } from 'zustand'
import type { SavePoint, SavePointDetail, GitStatus } from '@shared/types'
import { useFilesStore } from './files'

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
    }
  },

  refreshAll: async () => {
    set({ isLoading: true })
    const { loadHistory, loadStatus } = get()
    await Promise.all([loadHistory(), loadStatus()])
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
      await get().refreshAll()
    } catch (err) {
      console.error('[History] Failed to create save point:', err)
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
      set({ expandedDetail: detail, detailLoading: false })
    } catch (err) {
      console.error('[History] Failed to load detail:', err)
      set({ detailLoading: false })
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
      await get().refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('REVERT_CONFLICT')) {
        console.error('[History] Revert failed due to conflict')
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
      await get().refreshAll()
    } catch (err) {
      console.error('[History] Failed to restore:', err)
      set({ confirmRestore: null })
    }
  },

  cancelRestore: () => set({ confirmRestore: null }),

  dismissUncommittedDialog: () => set({ showUncommittedDialog: false }),

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
      fileStatusMap: {}
    })
}))
