import { create } from 'zustand'
import type { SkillMeta } from '@shared/types'
import { toast } from './toast'

interface SkillsState {
  skills: SkillMeta[]
  isLoading: boolean
  error: string | null

  loadSkills: () => Promise<void>
  addFromFolder: (target: 'global' | 'project') => Promise<void>
  addFromZip: (target: 'global' | 'project') => Promise<void>
  addFromGit: (url: string, target: 'global' | 'project') => Promise<void>
  removeSkill: (path: string) => Promise<void>
  toggleSkill: (path: string) => Promise<void>
  openFolder: (target: 'global' | 'project') => Promise<void>
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  isLoading: false,
  error: null,

  loadSkills: async () => {
    set({ isLoading: true, error: null })
    try {
      const skills = await window.orchestrate.getSkills()
      set({ skills, isLoading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false })
    }
  },

  addFromFolder: async (target) => {
    try {
      await window.orchestrate.addSkillFromFolder('', target)
      await get().loadSkills()
      toast.info('Skills updated.')
    } catch (err) {
      if (err instanceof Error && err.message === 'No folder selected') return
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  addFromZip: async (target) => {
    try {
      await window.orchestrate.addSkillFromZip('', target)
      await get().loadSkills()
      toast.info('Skills updated.')
    } catch (err) {
      if (err instanceof Error && err.message === 'No file selected') return
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  addFromGit: async (url, target) => {
    try {
      await window.orchestrate.addSkillFromGit(url, target)
      await get().loadSkills()
      toast.info('Skills updated.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  removeSkill: async (path) => {
    try {
      await window.orchestrate.removeSkill(path)
      await get().loadSkills()
      toast.info('Skills updated.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  toggleSkill: async (path) => {
    const skill = get().skills.find((s) => s.path === path)
    if (!skill) return
    try {
      await window.orchestrate.setSkillEnabled(path, !skill.enabled)
      await get().loadSkills()
      toast.info('Skills updated.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  openFolder: async (target) => {
    try {
      await window.orchestrate.openSkillsFolder(target)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  }
}))
