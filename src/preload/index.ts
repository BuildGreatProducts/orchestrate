import { contextBridge, ipcRenderer } from 'electron'
import type {
  OrchestrateAPI,
  FileChangeEvent,
  BrowserTabInfo,
  BrowserBounds,
  BrowserSnapshot,
  BoardState,
  TaskListState,
  UpdateState
} from '@shared/types'

const api: OrchestrateAPI = {
  // Folder
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  getLastFolder: () => ipcRenderer.invoke('folder:getLast'),
  getProjects: () => ipcRenderer.invoke('folder:getProjects'),
  addProject: (path) => ipcRenderer.invoke('folder:addProject', path),
  removeProject: (path) => ipcRenderer.invoke('folder:removeProject', path),
  setActiveProject: (path) => ipcRenderer.invoke('folder:setActive', path),

  // Files
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('file:write', path, content),
  deleteFile: (path) => ipcRenderer.invoke('file:delete', path),
  listDirectory: (path) => ipcRenderer.invoke('file:listDir', path),
  createFile: (path) => ipcRenderer.invoke('file:createFile', path),
  createFolder: (path) => ipcRenderer.invoke('file:createDir', path),
  watchFolder: (callback: (event: FileChangeEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: FileChangeEvent): void => {
      callback(event)
    }
    ipcRenderer.on('file:changed', handler)
    return () => {
      ipcRenderer.removeListener('file:changed', handler)
    }
  },

  // Terminals
  createTerminal: (id, cwd, command?, dimensions?) =>
    ipcRenderer.invoke('terminal:create', id, cwd, command, dimensions),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.invoke('terminal:close', id),
  onTerminalOutput: (callback: (id: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, data: string): void => {
      callback(id, data)
    }
    ipcRenderer.on('terminal:output', handler)
    return () => {
      ipcRenderer.removeListener('terminal:output', handler)
    }
  },

  onTerminalExit: (callback: (id: string, exitCode: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, exitCode: number): void => {
      callback(id, exitCode)
    }
    ipcRenderer.on('terminal:exit', handler)
    return () => {
      ipcRenderer.removeListener('terminal:exit', handler)
    }
  },

  // Tasks
  loadTasks: () => ipcRenderer.invoke('task:loadTasks'),
  loadTasksForProject: (projectFolder: string) =>
    ipcRenderer.invoke('task:loadTasksForProject', projectFolder),
  saveTasks: (tasks: TaskListState) => ipcRenderer.invoke('task:saveTasks', tasks),
  saveTasksForProject: (projectFolder: string, tasks: TaskListState) =>
    ipcRenderer.invoke('task:saveTasksForProject', projectFolder, tasks),
  deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id),
  sendToAgent: (id: string, agent: string) => ipcRenderer.invoke('task:sendToAgent', id, agent),
  sendToAgentForProject: (projectFolder: string, id: string, agent: string) =>
    ipcRenderer.invoke('task:sendToAgentForProject', projectFolder, id, agent),

  // Legacy task aliases
  loadBoard: () => ipcRenderer.invoke('task:loadBoard'),
  saveBoard: (board: BoardState) => ipcRenderer.invoke('task:saveBoard', board),
  readTaskMarkdown: (id: string) => ipcRenderer.invoke('task:readMarkdown', id),
  writeTaskMarkdown: (id: string, content: string) =>
    ipcRenderer.invoke('task:writeMarkdown', id, content),

  // Saved Commands
  listCommands: (projectFolder?) => ipcRenderer.invoke('command:list', projectFolder),
  loadCommand: (id, scope, projectFolder?) =>
    ipcRenderer.invoke('command:load', id, scope, projectFolder),
  saveCommand: (command, projectFolder?) =>
    ipcRenderer.invoke('command:save', command, projectFolder),
  deleteCommand: (id, scope, projectFolder?) =>
    ipcRenderer.invoke('command:delete', id, scope, projectFolder),

  onTaskScheduleTrigger: (callback: (taskId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, taskId: string): void => {
      callback(taskId)
    }
    ipcRenderer.on('task:scheduleTrigger', handler)
    return () => {
      ipcRenderer.removeListener('task:scheduleTrigger', handler)
    }
  },

  // MCP State Changes (used by MCP server tool handlers)
  onAgentStateChanged: (callback: (domain: string, data?: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, domain: string, data?: unknown): void => {
      callback(domain, data)
    }
    ipcRenderer.on('agent:stateChanged', handler)
    return () => {
      ipcRenderer.removeListener('agent:stateChanged', handler)
    }
  },

  // Browser
  createBrowserTab: (id: string, url: string) => ipcRenderer.invoke('browser:create', id, url),
  closeBrowserTab: (id: string) => ipcRenderer.invoke('browser:close', id),
  navigateBrowser: (id: string, url: string) => ipcRenderer.invoke('browser:navigate', id, url),
  browserGoBack: (id: string) => ipcRenderer.invoke('browser:goBack', id),
  browserGoForward: (id: string) => ipcRenderer.invoke('browser:goForward', id),
  browserReload: (id: string) => ipcRenderer.invoke('browser:reload', id),
  browserStop: (id: string) => ipcRenderer.invoke('browser:stop', id),
  setBrowserBounds: (id: string, bounds: BrowserBounds) =>
    ipcRenderer.invoke('browser:setBounds', id, bounds),
  showBrowserTab: (id: string) => ipcRenderer.invoke('browser:show', id),
  hideAllBrowserTabs: () => ipcRenderer.invoke('browser:hideAll'),
  captureBrowserTab: (id: string): Promise<BrowserSnapshot | null> =>
    ipcRenderer.invoke('browser:capture', id),
  closeAllBrowserTabs: () => ipcRenderer.invoke('browser:closeAll'),
  toggleBrowserDevTools: (id: string) => ipcRenderer.invoke('browser:toggleDevTools', id),
  onBrowserTabUpdated: (callback: (tab: BrowserTabInfo) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tab: BrowserTabInfo): void => {
      callback(tab)
    }
    ipcRenderer.on('browser:tabUpdated', handler)
    return () => {
      ipcRenderer.removeListener('browser:tabUpdated', handler)
    }
  },
  onBrowserTabClosed: (callback: (id: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, id: string): void => {
      callback(id)
    }
    ipcRenderer.on('browser:tabClosed', handler)
    return () => {
      ipcRenderer.removeListener('browser:tabClosed', handler)
    }
  },

  // MCP
  getMcpServerUrl: () => ipcRenderer.invoke('mcp:getUrl'),
  getMcpConfigPath: () => ipcRenderer.invoke('mcp:getConfigPath'),
  getCodexMcpFlags: () => ipcRenderer.invoke('mcp:getCodexFlags'),
  getMcpConfigPathForProject: (projectFolder: string, taskId?: string) =>
    ipcRenderer.invoke('mcp:getConfigPathForProject', projectFolder, taskId),
  getCodexMcpFlagsForProject: (projectFolder: string, taskId?: string) =>
    ipcRenderer.invoke('mcp:getCodexFlagsForProject', projectFolder, taskId),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  quitAndInstall: () => ipcRenderer.send('updater:install'),
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: UpdateState): void => {
      callback(state)
    }
    ipcRenderer.on('updater:state', handler)
    return () => {
      ipcRenderer.removeListener('updater:state', handler)
    }
  },

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),

  // Skills
  getSkills: () => ipcRenderer.invoke('skill:list'),
  addSkillFromFolder: (sourcePath, target) =>
    ipcRenderer.invoke('skill:addFromFolder', sourcePath, target),
  addSkillFromZip: (zipPath, target) => ipcRenderer.invoke('skill:addFromZip', zipPath, target),
  addSkillFromGit: (repoUrl, target) => ipcRenderer.invoke('skill:addFromGit', repoUrl, target),
  removeSkill: (skillPath) => ipcRenderer.invoke('skill:remove', skillPath),
  setSkillEnabled: (skillPath, enabled) =>
    ipcRenderer.invoke('skill:setEnabled', skillPath, enabled),
  getSkillContent: (skillPath) => ipcRenderer.invoke('skill:getContent', skillPath),
  openSkillsFolder: (target) => ipcRenderer.invoke('skill:openFolder', target),

  // Git / History
  isGitRepo: (projectFolder?) => ipcRenderer.invoke('git:isRepo', projectFolder),
  initRepo: () => ipcRenderer.invoke('git:init'),
  getHistory: (limit?) => ipcRenderer.invoke('git:history', limit),
  getStatus: () => ipcRenderer.invoke('git:status'),
  createSavePoint: (message) => ipcRenderer.invoke('git:createSavePoint', message),
  getSavePointDetail: (hash) => ipcRenderer.invoke('git:detail', hash),
  getSavePointDiff: (hash, filePath) => ipcRenderer.invoke('git:diff', hash, filePath),
  revertSavePoint: (hash) => ipcRenderer.invoke('git:revert', hash),
  restoreToSavePoint: (hash) => ipcRenderer.invoke('git:restore', hash),
  hasUncommittedChanges: () => ipcRenderer.invoke('git:hasChanges'),
  getCommitGraph: (limit?, branch?) => ipcRenderer.invoke('git:commitGraph', limit, branch),
  getBranches: () => ipcRenderer.invoke('git:branches'),

  // Branches (project-specific)
  listBranches: (projectFolder) => ipcRenderer.invoke('branch:list', projectFolder),
  checkoutBranch: (projectFolder, branch) =>
    ipcRenderer.invoke('branch:checkout', projectFolder, branch),
  createBranch: (projectFolder, branch) =>
    ipcRenderer.invoke('branch:create', projectFolder, branch),
  deleteBranch: (projectFolder, branch, force?) =>
    ipcRenderer.invoke('branch:delete', projectFolder, branch, force),
  getRemoteUrl: (projectFolder) => ipcRenderer.invoke('branch:remoteUrl', projectFolder),

  // Worktrees
  listWorktrees: (projectFolder) => ipcRenderer.invoke('worktree:list', projectFolder),
  addWorktree: (projectFolder, path, branch, createBranch) =>
    ipcRenderer.invoke('worktree:add', projectFolder, path, branch, createBranch),
  removeWorktree: (projectFolder, worktreePath, force?) =>
    ipcRenderer.invoke('worktree:remove', projectFolder, worktreePath, force),
  diffWorktreeFiles: (projectFolder, baseBranch, compareBranch) =>
    ipcRenderer.invoke('worktree:diffFiles', projectFolder, baseBranch, compareBranch),
  diffWorktreeFile: (projectFolder, baseBranch, compareBranch, filePath) =>
    ipcRenderer.invoke('worktree:diffFile', projectFolder, baseBranch, compareBranch, filePath),
  mergeWorktree: (projectFolder, branch) =>
    ipcRenderer.invoke('worktree:merge', projectFolder, branch)
}

contextBridge.exposeInMainWorld('orchestrate', api)
