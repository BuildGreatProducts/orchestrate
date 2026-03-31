import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { LoopManager, validateLoopId } from '../loop-manager'
import type { Loop } from '@shared/types'

let loopManager: LoopManager | null = null
let getCurrentFolderFn: (() => string | null) | null = null

export function getLoopManager(): LoopManager | null {
  if (!getCurrentFolderFn) return null
  const folder = getCurrentFolderFn()
  if (!folder) return null
  if (!loopManager) {
    loopManager = new LoopManager(folder)
  } else {
    loopManager.setProjectFolder(folder)
  }
  return loopManager
}

function getManager(): LoopManager {
  const mgr = getLoopManager()
  if (!mgr) throw new Error('No project folder selected')
  return mgr
}

export function registerLoopHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  getCurrentFolderFn = getCurrentFolder

  markChannelRegistered('loop:list')
  markChannelRegistered('loop:load')
  markChannelRegistered('loop:save')
  markChannelRegistered('loop:delete')

  ipcMain.handle('loop:list', async () => {
    const mgr = getManager()
    return mgr.listLoops()
  })

  ipcMain.handle('loop:load', async (_, id: string) => {
    validateLoopId(id)
    const mgr = getManager()
    return mgr.loadLoop(id)
  })

  ipcMain.handle('loop:save', async (_, loop: Loop) => {
    const mgr = getManager()
    await mgr.saveLoop(loop)
  })

  ipcMain.handle('loop:delete', async (_, id: string) => {
    validateLoopId(id)
    const mgr = getManager()
    await mgr.deleteLoop(id)
  })
}
