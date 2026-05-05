import { ipcMain } from 'electron'

interface StubDef {
  channel: string
  returns: unknown
}

const stubs: StubDef[] = [
  // Files
  { channel: 'file:read', returns: '' },
  { channel: 'file:write', returns: undefined },
  { channel: 'file:delete', returns: undefined },
  { channel: 'file:listDir', returns: [] },
  { channel: 'file:createFile', returns: undefined },
  { channel: 'file:createDir', returns: undefined },

  // Terminals
  { channel: 'terminal:create', returns: undefined },
  { channel: 'terminal:close', returns: undefined },

  // Tasks
  { channel: 'task:loadTasks', returns: { version: 1, order: [], tasks: {} } },
  { channel: 'task:loadTasksForProject', returns: { version: 1, order: [], tasks: {} } },
  { channel: 'task:saveTasks', returns: undefined },
  { channel: 'task:saveTasksForProject', returns: undefined },
  {
    channel: 'task:loadBoard',
    returns: { columns: { planning: [], 'in-progress': [], review: [], done: [] }, tasks: {} }
  },
  { channel: 'task:saveBoard', returns: undefined },
  { channel: 'task:readMarkdown', returns: '' },
  { channel: 'task:writeMarkdown', returns: undefined },
  { channel: 'task:delete', returns: undefined },
  { channel: 'task:sendToAgent', returns: undefined },
  { channel: 'task:sendToAgentForProject', returns: undefined },

  // Saved Commands
  { channel: 'command:list', returns: [] },
  { channel: 'command:load', returns: null },
  { channel: 'command:save', returns: undefined },
  { channel: 'command:delete', returns: undefined },

  // Git
  { channel: 'git:isRepo', returns: false },
  { channel: 'git:init', returns: undefined },
  { channel: 'git:history', returns: [] },
  { channel: 'git:status', returns: { modified: [], added: [], deleted: [], untracked: [] } },
  { channel: 'git:createSavePoint', returns: '' },
  { channel: 'git:detail', returns: { hash: '', message: '', date: '', files: [] } },
  { channel: 'git:diff', returns: '' },
  { channel: 'git:revert', returns: undefined },
  { channel: 'git:restore', returns: undefined },
  { channel: 'git:hasChanges', returns: false },

  // Browser
  { channel: 'browser:create', returns: undefined },
  { channel: 'browser:close', returns: undefined },
  { channel: 'browser:navigate', returns: undefined },
  { channel: 'browser:goBack', returns: undefined },
  { channel: 'browser:goForward', returns: undefined },
  { channel: 'browser:reload', returns: undefined },
  { channel: 'browser:stop', returns: undefined },
  { channel: 'browser:setBounds', returns: undefined },
  { channel: 'browser:show', returns: undefined },
  { channel: 'browser:hideAll', returns: undefined },
  { channel: 'browser:capture', returns: null },
  { channel: 'browser:closeAll', returns: undefined },
  { channel: 'browser:toggleDevTools', returns: undefined },

  // Skills
  { channel: 'skill:list', returns: [] },
  { channel: 'skill:addFromFolder', returns: null },
  { channel: 'skill:addFromZip', returns: null },
  { channel: 'skill:addFromGit', returns: null },
  { channel: 'skill:remove', returns: undefined },
  { channel: 'skill:setEnabled', returns: undefined },
  { channel: 'skill:getContent', returns: '' },
  { channel: 'skill:openFolder', returns: undefined },

  // MCP Registry
  { channel: 'mcp:getUrl', returns: null },
  { channel: 'mcp:getConfigPath', returns: null },
  { channel: 'mcp:getCodexFlags', returns: null },
  { channel: 'mcp:getConfigPathForProject', returns: null },
  { channel: 'mcp:getCodexFlagsForProject', returns: null },
  { channel: 'mcp:listRegistry', returns: { servers: [], project: null } },
  { channel: 'mcp:addServer', returns: null },
  { channel: 'mcp:updateServer', returns: null },
  { channel: 'mcp:removeServer', returns: undefined },
  { channel: 'mcp:setProjectEnabled', returns: null },
  { channel: 'mcp:testServer', returns: null },
  { channel: 'mcp:startOAuth', returns: null }
]

// Track which channels have real handlers registered
const registeredChannels = new Set<string>()

export function markChannelRegistered(channel: string): void {
  registeredChannels.add(channel)
}

export function registerStubHandlers(): void {
  for (const { channel, returns } of stubs) {
    if (!registeredChannels.has(channel)) {
      ipcMain.handle(channel, () => {
        console.log(`[IPC Stub] ${channel} called — not yet implemented`)
        return returns
      })
    }
  }
}
