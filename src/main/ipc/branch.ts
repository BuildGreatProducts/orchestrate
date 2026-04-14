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

export function registerBranchHandlers(
  _getWindow: () => BrowserWindow | null,
  _getCurrentFolder: () => string | null
): void {
  markChannelRegistered('branch:list')
  markChannelRegistered('branch:checkout')
  markChannelRegistered('branch:create')
  markChannelRegistered('branch:delete')

  function getManager(projectFolder: unknown): GitManager {
    validatePath(projectFolder)
    return new GitManager(projectFolder)
  }

  ipcMain.handle('branch:list', async (_, projectFolder: string) => {
    try {
      return await getManager(projectFolder).getBranches()
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'branch:checkout',
    async (_, projectFolder: string, branch: string) => {
      validateBranch(branch)
      await getManager(projectFolder).checkout(branch)
    }
  )

  ipcMain.handle(
    'branch:create',
    async (_, projectFolder: string, branch: string) => {
      validateBranch(branch)
      await getManager(projectFolder).createBranch(branch)
    }
  )

  ipcMain.handle(
    'branch:delete',
    async (_, projectFolder: string, branch: string, force?: boolean) => {
      validateBranch(branch)
      await getManager(projectFolder).deleteBranch(branch, force)
    }
  )
}
