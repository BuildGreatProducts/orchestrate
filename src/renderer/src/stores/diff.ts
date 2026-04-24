import { create } from 'zustand'
import { ipc } from '@electron-toolkit/utils'

interface DiffState {
  originalContent: string | null
  modifiedContent: string | null
  originalLabel: string
  modifiedLabel: string
  isLoading: boolean
  loadDiff: (filePath: string, ref1: string, ref2: string) => Promise<void>
  clear: () => void
}

export const useDiffStore = create<DiffState>((set) => ({
  originalContent: null,
  modifiedContent: null,
  originalLabel: '',
  modifiedLabel: '',
  isLoading: false,

  loadDiff: async (filePath, ref1, ref2) => {
    set({ isLoading: true })
    try {
      const [original, modified] = await Promise.all([
        ipc.invoke('git:get-file-at-ref', { filePath, ref: ref1 }),
        ipc.invoke('git:get-file-at-ref', { filePath, ref: ref2 }),
      ])
      set({
        originalContent: original,
        modifiedContent: modified,
        originalLabel: ref1,
        modifiedLabel: ref2,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  clear: () => set({
    originalContent: null,
    modifiedContent: null,
    originalLabel: '',
    modifiedLabel: '',
  }),
}))