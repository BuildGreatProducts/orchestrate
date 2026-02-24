import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerFolderHandlers, getCurrentFolder } from './ipc/folder'
import { registerFileHandlers } from './ipc/files'
import { registerStubHandlers } from './ipc/stubs'
import { startWatching, stopWatching } from './file-watcher'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.weareheroes.orchestrate')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register real handlers first, then stubs for everything else
  registerFolderHandlers(() => mainWindow, (folder) => {
    startWatching(folder, () => mainWindow)
  })
  registerFileHandlers(() => mainWindow, getCurrentFolder)
  registerStubHandlers()

  // Start watching the last-used folder if one exists
  const lastFolder = getCurrentFolder()
  if (lastFolder) {
    startWatching(lastFolder, () => mainWindow)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopWatching()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
