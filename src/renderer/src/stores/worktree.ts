import { create } from 'zustand'
import type { WorktreeInfo } from '@shared/types'

interface WorktreeState {
  worktrees: Record<string, WorktreeInfo[]>
  collapsedWorktrees: Record<string, boolean>
  loading: Record<string, boolean>

  loadWorktrees: (projectFolder: string) => Promise<void>
  toggleWorktreeCollapsed: (worktreePath: string) => void
  addWorktree: (projectFolder: string, branch: string) => Promise<string>
  removeWorktree: (projectFolder: string, worktreePath: string, force?: boolean) => Promise<void>
}

function computeWorktreePath(projectFolder: string, branch: string): string {
  const lastSep = Math.max(projectFolder.lastIndexOf('/'), projectFolder.lastIndexOf('\\'))
  const parentDir = lastSep > 0 ? projectFolder.slice(0, lastSep) : projectFolder
  const projectName = lastSep > 0 ? projectFolder.slice(lastSep + 1) : projectFolder
  const safeBranch = branch.replace(/\//g, '-')
  return `${parentDir}/${projectName}--${safeBranch}`
}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  worktrees: {},
  collapsedWorktrees: {},
  loading: {},

  loadWorktrees: async (projectFolder: string) => {
    set((s) => ({ loading: { ...s.loading, [projectFolder]: true } }))
    try {
      const list = await window.orchestrate.listWorktrees(projectFolder)
      set((s) => ({
        worktrees: { ...s.worktrees, [projectFolder]: list },
        loading: { ...s.loading, [projectFolder]: false }
      }))
    } catch {
      set((s) => ({
        worktrees: { ...s.worktrees, [projectFolder]: [] },
        loading: { ...s.loading, [projectFolder]: false }
      }))
    }
  },

  toggleWorktreeCollapsed: (worktreePath: string) => {
    set((s) => ({
      collapsedWorktrees: {
        ...s.collapsedWorktrees,
        [worktreePath]: !s.collapsedWorktrees[worktreePath]
      }
    }))
  },

  addWorktree: async (projectFolder: string, branch: string) => {
    const worktreePath = computeWorktreePath(projectFolder, branch)

    try {
      // Try checking out existing branch first
      await window.orchestrate.addWorktree(projectFolder, worktreePath, branch, false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Only retry with -b if git says the branch doesn't exist
      if (msg.includes('invalid reference') || msg.includes('not a valid object name') || msg.includes('did not match any')) {
        await window.orchestrate.addWorktree(projectFolder, worktreePath, branch, true)
      } else {
        throw err
      }
    }

    await get().loadWorktrees(projectFolder)
    return worktreePath
  },

  removeWorktree: async (projectFolder: string, worktreePath: string, force?: boolean) => {
    await window.orchestrate.removeWorktree(projectFolder, worktreePath, force)
    await get().loadWorktrees(projectFolder)
  }
}))
