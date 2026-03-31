import { contextBridge, ipcRenderer } from 'electron'
import type {
  OrchestrateAPI,
  FileChangeEvent,
  AgentResponseChunk,
  BrowserTabInfo,
  BrowserBounds,
  BoardState
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
  createTerminal: (id, cwd, command?) => ipcRenderer.invoke('terminal:create', id, cwd, command),
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
  loadBoard: () => ipcRenderer.invoke('task:loadBoard'),
  saveBoard: (board: BoardState) => ipcRenderer.invoke('task:saveBoard', board),
  readTaskMarkdown: (id: string) => ipcRenderer.invoke('task:readMarkdown', id),
  writeTaskMarkdown: (id: string, content: string) => ipcRenderer.invoke('task:writeMarkdown', id, content),
  deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id),
  sendToAgent: (id: string, agent: string) => ipcRenderer.invoke('task:sendToAgent', id, agent),

  // Loops
  listLoops: () => ipcRenderer.invoke('loop:list'),
  loadLoop: (id) => ipcRenderer.invoke('loop:load', id),
  saveLoop: (loop) => ipcRenderer.invoke('loop:save', loop),
  deleteLoop: (id) => ipcRenderer.invoke('loop:delete', id),
  onLoopTrigger: (callback: (loopId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, loopId: string): void => {
      callback(loopId)
    }
    ipcRenderer.on('loop:trigger', handler)
    return () => {
      ipcRenderer.removeListener('loop:trigger', handler)
    }
  },

  // Manage Agent
  sendAgentMessage: (message) => ipcRenderer.invoke('agent:message', message),
  onAgentResponse: (callback: (chunk: AgentResponseChunk) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: AgentResponseChunk): void => {
      callback(chunk)
    }
    ipcRenderer.on('agent:response', handler)
    return () => {
      ipcRenderer.removeListener('agent:response', handler)
    }
  },
  onAgentToolUse: (callback: (tool: string, input: Record<string, unknown>) => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      tool: string,
      input: Record<string, unknown>
    ): void => {
      callback(tool, input)
    }
    ipcRenderer.on('agent:toolUse', handler)
    return () => {
      ipcRenderer.removeListener('agent:toolUse', handler)
    }
  },
  setApiKey: (key: string) => ipcRenderer.invoke('agent:setApiKey', key),
  hasApiKey: () => ipcRenderer.invoke('agent:hasApiKey'),
  clearAgentConversation: () => ipcRenderer.invoke('agent:clearConversation'),
  cancelAgentMessage: () => ipcRenderer.invoke('agent:cancel'),
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

  // Chat History
  listConversations: () => ipcRenderer.invoke('chatHistory:list'),
  loadConversation: (id: string) => ipcRenderer.invoke('chatHistory:load', id),
  saveConversation: (conversation) => ipcRenderer.invoke('chatHistory:save', conversation),
  deleteConversation: (id: string) => ipcRenderer.invoke('chatHistory:delete', id),
  renameConversation: (id: string, title: string) => ipcRenderer.invoke('chatHistory:rename', id, title),

  // Git / History
  isGitRepo: () => ipcRenderer.invoke('git:isRepo'),
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
  getBranches: () => ipcRenderer.invoke('git:branches')
}

contextBridge.exposeInMainWorld('orchestrate', api)
