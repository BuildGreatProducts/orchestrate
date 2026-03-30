import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { toast } from './toast'
import type { Loop, LoopRun } from '@shared/types'

interface LoopsState {
  loops: Loop[]
  isLoading: boolean
  hasLoaded: boolean
  selectedLoopId: string | null
  editingLoop: Partial<Loop> | null

  loadLoops: () => Promise<void>
  resetLoops: () => void
  createLoop: (loop: Omit<Loop, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateLoop: (loop: Loop) => Promise<void>
  deleteLoop: (id: string) => Promise<void>
  selectLoop: (id: string | null) => void
  setEditingLoop: (loop: Partial<Loop> | null) => void
  updateLoopRun: (loopId: string, run: LoopRun) => void
}

export const useLoopsStore = create<LoopsState>((set, get) => ({
  loops: [],
  isLoading: false,
  hasLoaded: false,
  selectedLoopId: null,
  editingLoop: null,

  loadLoops: async () => {
    set({ isLoading: true })
    try {
      const loops = await window.orchestrate.listLoops()
      set({ loops, isLoading: false, hasLoaded: true })
    } catch (err) {
      console.error('[Loops] Failed to load loops:', err)
      set({ loops: [], isLoading: false, hasLoaded: true })
    }
  },

  resetLoops: () => {
    set({ loops: [], selectedLoopId: null, hasLoaded: false, editingLoop: null })
  },

  createLoop: async (loopData) => {
    const id = nanoid(8)
    const now = new Date().toISOString()
    const loop: Loop = {
      ...loopData,
      id,
      createdAt: now,
      updatedAt: now
    }
    try {
      await window.orchestrate.saveLoop(loop)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save loop: ${msg}`)
      throw err
    }
    set((state) => ({ loops: [loop, ...state.loops] }))
  },

  updateLoop: async (loop) => {
    const updated = { ...loop, updatedAt: new Date().toISOString() }
    await window.orchestrate.saveLoop(updated)
    set((state) => ({
      loops: state.loops.map((l) => (l.id === loop.id ? updated : l))
    }))
  },

  deleteLoop: async (id) => {
    await window.orchestrate.deleteLoop(id)
    set((state) => ({
      loops: state.loops.filter((l) => l.id !== id),
      selectedLoopId: state.selectedLoopId === id ? null : state.selectedLoopId
    }))
  },

  selectLoop: (id) => set({ selectedLoopId: id }),

  setEditingLoop: (loop) => set({ editingLoop: loop }),

  updateLoopRun: (loopId, run) => {
    set((state) => ({
      loops: state.loops.map((l) => (l.id === loopId ? { ...l, lastRun: run } : l))
    }))
    // Persist the updated loop with lastRun
    const loop = get().loops.find((l) => l.id === loopId)
    if (loop) {
      window.orchestrate.saveLoop(loop).catch((err) => {
        console.error('[Loops] Failed to persist loop run:', err)
      })
    }
  }
}))
