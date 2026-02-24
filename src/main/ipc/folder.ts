import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { markChannelRegistered } from './stubs'

const store = new Store<{ lastFolder: string | null }>({
  defaults: { lastFolder: null }
})

export function getCurrentFolder(): string | null {
  return store.get('lastFolder')
}

export function registerFolderHandlers(
  getWindow: () => BrowserWindow | null,
  onFolderChange?: (folder: string) => void
): void {
  markChannelRegistered('folder:select')
  markChannelRegistered('folder:getLast')

  ipcMain.handle('folder:select', async () => {
    const win = getWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const folderPath = result.filePaths[0]
    store.set('lastFolder', folderPath)
    onFolderChange?.(folderPath)
    return folderPath
  })

  ipcMain.handle('folder:getLast', () => {
    return store.get('lastFolder')
  })
}
