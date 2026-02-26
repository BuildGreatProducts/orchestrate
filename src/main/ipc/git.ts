import { ipcMain, BrowserWindow } from 'electron'
import { normalize } from 'path'
import { markChannelRegistered } from './stubs'
import { GitManager } from '../git-manager'

const SAFE_HASH_RE = /^[0-9a-f]{4,40}$/i

function validateHash(hash: unknown): asserts hash is string {
  if (typeof hash !== 'string' || !SAFE_HASH_RE.test(hash)) {
    throw new Error(`Invalid git hash: ${String(hash)}`)
  }
}

function validateFilePath(filePath: unknown): asserts filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('File path is required')
  }
  // Reject absolute paths and parent-segment escapes
  const normalized = normalize(filePath)
  if (normalized.startsWith('/') || normalized.startsWith('\\') || normalized.startsWith('..')) {
    throw new Error('Invalid file path: must be a relative path within the repository')
  }
}

let gitManager: GitManager | null = null
let getCurrentFolderFn: (() => string | null) | null = null

/**
 * Returns the GitManager with its cwd synchronized to the current folder.
 * Safe to call from other IPC modules (e.g., tasks).
 */
export function getGitManager(): GitManager | null {
  if (!gitManager || !getCurrentFolderFn) return null
  const folder = getCurrentFolderFn()
  if (!folder) return null
  gitManager.setCwd(folder)
  return gitManager
}

export function registerGitHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  getCurrentFolderFn = getCurrentFolder
  markChannelRegistered('git:isRepo')
  markChannelRegistered('git:init')
  markChannelRegistered('git:history')
  markChannelRegistered('git:status')
  markChannelRegistered('git:createSavePoint')
  markChannelRegistered('git:detail')
  markChannelRegistered('git:diff')
  markChannelRegistered('git:revert')
  markChannelRegistered('git:restore')
  markChannelRegistered('git:hasChanges')

  function getManager(): GitManager {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    if (!gitManager) {
      gitManager = new GitManager(folder)
    } else {
      gitManager.setCwd(folder)
    }
    return gitManager
  }

  ipcMain.handle('git:isRepo', async () => {
    return getManager().isRepo()
  })

  ipcMain.handle('git:init', async () => {
    await getManager().init()
  })

  ipcMain.handle('git:history', async (_, limit?: number) => {
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 50
    return getManager().getHistory(safeLimit)
  })

  ipcMain.handle('git:status', async () => {
    return getManager().getStatus()
  })

  ipcMain.handle('git:createSavePoint', async (_, message: string) => {
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Save point message is required')
    }
    return getManager().createSavePoint(message.trim())
  })

  ipcMain.handle('git:detail', async (_, hash: string) => {
    validateHash(hash)
    return getManager().getSavePointDetail(hash)
  })

  ipcMain.handle('git:diff', async (_, hash: string, filePath: string) => {
    validateHash(hash)
    validateFilePath(filePath)
    return getManager().getFileDiff(hash, filePath)
  })

  ipcMain.handle('git:revert', async (_, hash: string) => {
    validateHash(hash)
    await getManager().revert(hash)
  })

  ipcMain.handle('git:restore', async (_, hash: string) => {
    validateHash(hash)
    await getManager().restore(hash)
  })

  ipcMain.handle('git:hasChanges', async () => {
    return getManager().hasUncommittedChanges()
  })
}
