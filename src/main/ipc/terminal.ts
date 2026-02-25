import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { PtyManager } from '../pty-manager'

let ptyManager: PtyManager | null = null

export function registerTerminalHandlers(
  getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  markChannelRegistered('terminal:create')
  markChannelRegistered('terminal:close')

  // Remove any existing handlers to prevent duplicate accumulation
  ipcMain.removeHandler('terminal:create')
  ipcMain.removeHandler('terminal:close')
  ipcMain.removeAllListeners('terminal:input')
  ipcMain.removeAllListeners('terminal:resize')

  ptyManager = new PtyManager(
    (id, data) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:output', id, data)
      }
    },
    (id, exitCode) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('terminal:exit', id, exitCode)
      }
    }
  )

  ipcMain.handle('terminal:create', async (_, id: string, cwd: string, command?: string) => {
    const folder = getCurrentFolder()
    const resolvedCwd = cwd || folder || process.env.HOME || '/'
    ptyManager!.create(id, resolvedCwd, command)
  })

  ipcMain.handle('terminal:close', async (_, id: string) => {
    ptyManager!.close(id)
  })

  ipcMain.on('terminal:input', (_, id: string, data: string) => {
    ptyManager!.write(id, data)
  })

  ipcMain.on('terminal:resize', (_, id: string, cols: number, rows: number) => {
    ptyManager!.resize(id, cols, rows)
  })
}

export function getPtyManager(): PtyManager | null {
  return ptyManager
}

export function closeAllTerminals(): void {
  ptyManager?.closeAll()
}
