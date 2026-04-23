import { ipcMain, type BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { GitManager } from '../git-manager'

const SAFE_BRANCH_RE = /^[a-zA-Z0-9._\-/]+$/
const MAX_BRANCH_LEN = 200

function validateBranch(branch: unknown): asserts branch is string {
  if (typeof branch !== 'string' || branch.length === 0) {
    throw new Error('Branch name is required')
  }
  if (branch.length > MAX_BRANCH_LEN || !SAFE_BRANCH_RE.test(branch)) {
    throw new Error(`Invalid branch name: ${String(branch)}`)
  }
}

function validatePath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Path is required')
  }
}

export function registerWorktreeHandlers(
  _getWindow: () => BrowserWindow | null,
  _getCurrentFolder: () => string | null
): void {
  void _getWindow
  void _getCurrentFolder
  markChannelRegistered('worktree:list')
  markChannelRegistered('worktree:add')
  markChannelRegistered('worktree:remove')
  markChannelRegistered('worktree:diffFiles')
  markChannelRegistered('worktree:diffFile')
  markChannelRegistered('worktree:merge')

  function getManager(projectFolder: unknown): GitManager {
    validatePath(projectFolder)
    return new GitManager(projectFolder)
  }

  ipcMain.handle('worktree:list', async (_, projectFolder: string) => {
    try {
      return await getManager(projectFolder).listWorktrees()
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'worktree:add',
    async (_, projectFolder: string, path: string, branch: string, createBranch: boolean) => {
      validatePath(path)
      validateBranch(branch)
      await getManager(projectFolder).addWorktree(path, branch, !!createBranch)
    }
  )

  ipcMain.handle(
    'worktree:remove',
    async (_, projectFolder: string, worktreePath: string, force?: boolean) => {
      validatePath(worktreePath)
      await getManager(projectFolder).removeWorktree(worktreePath, force)
    }
  )

  ipcMain.handle(
    'worktree:diffFiles',
    async (_, projectFolder: string, baseBranch: string, compareBranch: string) => {
      validateBranch(baseBranch)
      validateBranch(compareBranch)
      return getManager(projectFolder).diffBranches(baseBranch, compareBranch)
    }
  )

  ipcMain.handle(
    'worktree:diffFile',
    async (_, projectFolder: string, baseBranch: string, compareBranch: string, filePath: string) => {
      validateBranch(baseBranch)
      validateBranch(compareBranch)
      validatePath(filePath)
      return getManager(projectFolder).getFileDiffBetweenBranches(baseBranch, compareBranch, filePath)
    }
  )

  ipcMain.handle(
    'worktree:merge',
    async (_, projectFolder: string, branch: string) => {
      validateBranch(branch)
      return getManager(projectFolder).mergeWorktreeBranch(branch)
    }
  )
}
