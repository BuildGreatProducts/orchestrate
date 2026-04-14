import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { markChannelRegistered } from './stubs'
import type { UpdateState } from '@shared/types'

export function registerUpdaterHandlers(getWindow: () => BrowserWindow | null): void {
  markChannelRegistered('updater:check')
  markChannelRegistered('updater:download')
  markChannelRegistered('updater:install')

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true
  }

  let state: UpdateState = { status: 'idle' }

  function pushState(next: Partial<UpdateState>): void {
    state = { ...state, ...next }
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:state', state)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    pushState({ status: 'checking', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    pushState({
      status: 'available',
      info: { version: info.version, releaseDate: info.releaseDate }
    })
  })

  autoUpdater.on('update-not-available', () => {
    pushState({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    pushState({
      status: 'downloading',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    pushState({
      status: 'downloaded',
      info: { version: info.version, releaseDate: info.releaseDate },
      progress: undefined
    })
  })

  autoUpdater.on('error', (err) => {
    pushState({ status: 'error', error: err.message })
  })

  ipcMain.handle('updater:check', async () => {
    await autoUpdater.checkForUpdates()
  })

  ipcMain.handle('updater:download', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}
