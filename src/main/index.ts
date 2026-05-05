import { fixPath } from './fix-path'

// Must run before anything else so spawned processes inherit the full PATH.
fixPath()

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, basename, isAbsolute, normalize } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerFolderHandlers, getCurrentFolder, resolveRegisteredProject } from './ipc/folder'
import { registerFileHandlers } from './ipc/files'
import { registerTerminalHandlers, closeAllTerminals, getPtyManager } from './ipc/terminal'
import { registerTaskHandlers, getTaskManager, getTaskManagerForProject } from './ipc/tasks'
import { TaskScheduler } from './task-scheduler'
import { registerGitHandlers, getGitManager } from './ipc/git'
import { GitManager } from './git-manager'
import { registerSkillHandlers } from './ipc/skills'
import { registerMcpRegistryHandlers } from './ipc/mcp-registry'
import { registerCommandHandlers } from './ipc/commands'
import { registerWorktreeHandlers } from './ipc/worktree'
import { registerBranchHandlers } from './ipc/branch'
import { registerBrowserHandlers, closeAllBrowserTabs } from './ipc/browser'
import { registerUpdaterHandlers } from './ipc/updater'
import { markChannelRegistered, registerStubHandlers } from './ipc/stubs'
import { startWatching, stopWatching } from './file-watcher'
import { SkillManager } from './skill-manager'
import { McpRegistryManager, type McpRegistryStoreData } from './agent/mcp-registry-manager'
import { McpConnectionManager } from './agent/mcp-connection-manager'
import Store from 'electron-store'
import { startMcpServer, getMcpServerUrl } from './agent/mcp-http-server'
import {
  writeMcpConfigFile,
  cleanupMcpConfigFile,
  getMcpConfigPath,
  getMcpConfigPathForProject,
  getCodexMcpFlags,
  getCodexMcpFlagsForProject
} from './agent/mcp-config'

let mainWindow: BrowserWindow | null = null
let closeMcpServer: (() => Promise<void>) | null = null
const skillStore = new Store()
const skillManager = new SkillManager(skillStore)
const getSkillManager = (): SkillManager => skillManager
const mcpStore = new Store<McpRegistryStoreData>({
  name: 'mcp-registry',
  defaults: { servers: [], projectServers: {} }
})
const mcpRegistryManager = new McpRegistryManager(mcpStore, resolveRegisteredProject)
const mcpConnectionManager = new McpConnectionManager(mcpRegistryManager)
const getMcpRegistryManager = (): McpRegistryManager => mcpRegistryManager
const getMcpConnectionManager = (): McpConnectionManager => mcpConnectionManager
const taskScheduler = new TaskScheduler(() => mainWindow)

function validatedProjectFolder(projectFolder: string): string {
  const normalized = normalize(projectFolder.trim())
  if (!isAbsolute(normalized)) {
    throw new Error('Project folder must be an absolute path')
  }
  return normalized
}

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
      closeAllBrowserTabs()
      taskScheduler.stopAll()
      startWatching(folder, () => mainWindow)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(`Orchestrate — ${basename(folder)}`)
      }
      // Reschedule tasks for the new project
      const taskMgr = getTaskManager()
      if (taskMgr) {
        taskMgr
          .loadTasks()
          .then((tasks) => taskScheduler.rescheduleProjectTasks(folder, tasks))
          .catch((err) => {
            console.error('[Scheduler] Failed to reschedule tasks:', err)
          })
      }
    }
  )
  registerFileHandlers(() => mainWindow, getCurrentFolder)
  registerTerminalHandlers(() => mainWindow, getCurrentFolder)
  registerTaskHandlers(() => mainWindow, getCurrentFolder, getPtyManager, taskScheduler)
  taskScheduler.setTaskLoader(async () => {
    const mgr = getTaskManager()
    if (!mgr) throw new Error('No task manager')
    return mgr.loadTasks()
  })
  taskScheduler.setProjectTaskLoader(async (projectFolder) =>
    getTaskManagerForProject(projectFolder).loadTasks()
  )
  registerGitHandlers(() => mainWindow, getCurrentFolder)
  registerWorktreeHandlers(() => mainWindow, getCurrentFolder)
  registerBranchHandlers(() => mainWindow, getCurrentFolder)
  registerSkillHandlers(() => mainWindow, getCurrentFolder, getSkillManager)
  registerMcpRegistryHandlers(getCurrentFolder, getMcpRegistryManager, getMcpConnectionManager)
  registerCommandHandlers(() => mainWindow, getCurrentFolder)
  registerBrowserHandlers(() => mainWindow)
  registerUpdaterHandlers(() => mainWindow)
  const mcpConfigChannels = [
    'mcp:getUrl',
    'mcp:getConfigPath',
    'mcp:getCodexFlags',
    'mcp:getConfigPathForProject',
    'mcp:getCodexFlagsForProject'
  ]
  mcpConfigChannels.forEach(markChannelRegistered)
  registerStubHandlers()

  // Register settings IPC handlers
  const settingsStore = new Store<Record<string, unknown>>({
    name: 'settings',
    defaults: { defaultBrowserUrl: 'http://localhost:3000' }
  })
  ipcMain.handle('settings:get', (_event, key: string) => settingsStore.get(key))
  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    settingsStore.set(key, value)
  })

  // Register MCP IPC handlers
  ipcMain.handle('mcp:getUrl', () => getMcpServerUrl())
  ipcMain.handle('mcp:getConfigPath', () => getMcpConfigPath())
  ipcMain.handle('mcp:getCodexFlags', () => getCodexMcpFlags())
  ipcMain.handle('mcp:getConfigPathForProject', (_event, projectFolder: string, taskId?: string) =>
    getMcpConfigPathForProject(projectFolder, taskId)
  )
  ipcMain.handle('mcp:getCodexFlagsForProject', (_event, projectFolder: string, taskId?: string) =>
    getCodexMcpFlagsForProject(projectFolder, taskId)
  )

  // Start the HTTP MCP server for CLI agents
  startMcpServer({
    getCurrentFolder,
    getTaskManager,
    getTaskManagerForProject,
    getGitManager,
    getGitManagerForProject: (projectFolder: string) =>
      new GitManager(validatedProjectFolder(projectFolder)),
    resolveProjectFolder: resolveRegisteredProject,
    getSkillManager,
    getMcpConnectionManager,
    getWindow: () => mainWindow,
    notifyStateChanged: (domain, data) => {
      mainWindow?.webContents.send('agent:stateChanged', domain, data)
    }
  })
    .then(({ port, close }) => {
      closeMcpServer = close
      writeMcpConfigFile(port)
    })
    .catch((err) => {
      console.error('[MCP] Failed to start HTTP server:', err)
    })

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
  taskScheduler.stopAll()
  stopWatching()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeMcpServer?.()
  mcpConnectionManager.closeAll().catch((err) => {
    console.error('[MCP] Failed to close upstream MCP connections:', err)
  })
  cleanupMcpConfigFile()
})
