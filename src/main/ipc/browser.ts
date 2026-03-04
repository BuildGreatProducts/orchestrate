import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { BrowserViewManager } from '../browser-manager'
import type { BrowserBounds } from '@shared/types'

let browserManager: BrowserViewManager | null = null

const channels = [
  'browser:create',
  'browser:close',
  'browser:navigate',
  'browser:goBack',
  'browser:goForward',
  'browser:reload',
  'browser:stop',
  'browser:setBounds',
  'browser:show',
  'browser:hideAll',
  'browser:closeAll',
  'browser:toggleDevTools'
]

export function registerBrowserHandlers(getWindow: () => BrowserWindow | null): void {
  for (const ch of channels) {
    markChannelRegistered(ch)
    ipcMain.removeHandler(ch)
  }

  browserManager = new BrowserViewManager(
    getWindow,
    (tab) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:tabUpdated', tab)
      }
    },
    (id) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:tabClosed', id)
      }
    }
  )

  ipcMain.handle('browser:create', async (_, id: string, url: string) => {
    browserManager!.create(id, url)
  })

  ipcMain.handle('browser:close', async (_, id: string) => {
    browserManager!.close(id)
  })

  ipcMain.handle('browser:navigate', async (_, id: string, url: string) => {
    browserManager!.navigate(id, url)
  })

  ipcMain.handle('browser:goBack', async (_, id: string) => {
    browserManager!.goBack(id)
  })

  ipcMain.handle('browser:goForward', async (_, id: string) => {
    browserManager!.goForward(id)
  })

  ipcMain.handle('browser:reload', async (_, id: string) => {
    browserManager!.reload(id)
  })

  ipcMain.handle('browser:stop', async (_, id: string) => {
    browserManager!.stop(id)
  })

  ipcMain.handle('browser:setBounds', async (_, id: string, bounds: BrowserBounds) => {
    browserManager!.setBounds(id, bounds)
  })

  ipcMain.handle('browser:show', async (_, id: string) => {
    browserManager!.show(id)
  })

  ipcMain.handle('browser:hideAll', async () => {
    browserManager!.hideAll()
  })

  ipcMain.handle('browser:closeAll', async () => {
    browserManager!.closeAll()
  })

  ipcMain.handle('browser:toggleDevTools', async (_, id: string) => {
    browserManager!.toggleDevTools(id)
  })
}

export function getBrowserManager(): BrowserViewManager | null {
  return browserManager
}

export function closeAllBrowserTabs(): void {
  browserManager?.closeAll()
}
