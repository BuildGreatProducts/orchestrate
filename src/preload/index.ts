import { contextBridge, ipcRenderer } from 'electron'
import type { OrchestrateAPI, FileChangeEvent, AgentResponseChunk } from '@shared/types'

const api: OrchestrateAPI = {
  // Folder
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  getLastFolder: () => ipcRenderer.invoke('folder:getLast'),

  // Files
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('file:write', path, content),
  deleteFile: (path) => ipcRenderer.invoke('file:delete', path),
  listDirectory: (path) => ipcRenderer.invoke('file:listDir', path),
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

  // Tasks
  loadBoard: () => ipcRenderer.invoke('task:loadBoard'),
  saveBoard: (board) => ipcRenderer.invoke('task:saveBoard', board),
  readTaskMarkdown: (id) => ipcRenderer.invoke('task:readMarkdown', id),
  writeTaskMarkdown: (id, content) => ipcRenderer.invoke('task:writeMarkdown', id, content),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),
  sendToAgent: (id, agent) => ipcRenderer.invoke('task:sendToAgent', id, agent),

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
  onAgentToolUse: (
    callback: (tool: string, input: Record<string, unknown>) => void
  ) => {
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
  hasUncommittedChanges: () => ipcRenderer.invoke('git:hasChanges')
}

contextBridge.exposeInMainWorld('orchestrate', api)
