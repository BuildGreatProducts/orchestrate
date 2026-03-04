import { app, shell, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerFolderHandlers, getCurrentFolder } from './ipc/folder'
import { registerFileHandlers } from './ipc/files'
import { registerTerminalHandlers, closeAllTerminals, getPtyManager } from './ipc/terminal'
import { registerTaskHandlers, getTaskManager } from './ipc/tasks'
import { registerGitHandlers, getGitManager } from './ipc/git'
import { registerAgentHandlers, clearAgentConversation } from './ipc/agent'
import { registerSkillHandlers } from './ipc/skills'
import { registerBrowserHandlers, closeAllBrowserTabs } from './ipc/browser'
import { registerStubHandlers } from './ipc/stubs'
import { startWatching, stopWatching } from './file-watcher'
import { SkillManager } from './skill-manager'
import Store from 'electron-store'

let mainWindow: BrowserWindow | null = null
const skillStore = new Store()
const skillManager = new SkillManager(skillStore)
const getSkillManager = (): SkillManager => skillManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'Orchestrate',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
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
  registerFolderHandlers(
    () => mainWindow,
    (folder) => {
      closeAllTerminals()
      closeAllBrowserTabs()
      clearAgentConversation()
      startWatching(folder, () => mainWindow)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(`Orchestrate — ${basename(folder)}`)
      }
    }
  )
  registerFileHandlers(() => mainWindow, getCurrentFolder)
  registerTerminalHandlers(() => mainWindow, getCurrentFolder)
  registerTaskHandlers(() => mainWindow, getCurrentFolder, getPtyManager)
  registerGitHandlers(() => mainWindow, getCurrentFolder)
  registerAgentHandlers(
    () => mainWindow,
    getCurrentFolder,
    getTaskManager,
    getGitManager,
    getPtyManager,
    getSkillManager
  )
  registerSkillHandlers(() => mainWindow, getCurrentFolder, getSkillManager)
  registerBrowserHandlers(() => mainWindow)
  registerStubHandlers()

  // Ensure global skills directory exists
  skillManager.ensureGlobalDir().catch((err) => {
    console.error('[Skills] Failed to create global skills directory:', err)
  })

  // Start watching the last-used folder if one exists
  const lastFolder = getCurrentFolder()
  if (lastFolder) {
    startWatching(lastFolder, () => mainWindow)
  }

  // Set dock icon for macOS dev mode
  if (is.dev && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  createWindow()

  // Set initial window title if a folder was previously open
  if (lastFolder && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`Orchestrate — ${basename(lastFolder)}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeAllTerminals()
  closeAllBrowserTabs()
  stopWatching()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
