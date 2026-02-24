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

  // Terminals
  { channel: 'terminal:create', returns: undefined },
  { channel: 'terminal:close', returns: undefined },

  // Tasks
  { channel: 'task:loadBoard', returns: null },
  { channel: 'task:saveBoard', returns: undefined },
  { channel: 'task:readMarkdown', returns: '' },
  { channel: 'task:writeMarkdown', returns: undefined },
  { channel: 'task:delete', returns: undefined },
  { channel: 'task:sendToAgent', returns: undefined },

  // Agent
  { channel: 'agent:message', returns: undefined },

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
  { channel: 'git:hasChanges', returns: false }
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
