import { ipcMain } from 'electron'
import { markChannelRegistered } from './stubs'
import type { McpServerInput } from '@shared/types'
import type { McpRegistryManager } from '../agent/mcp-registry-manager'
import type { McpConnectionManager } from '../agent/mcp-connection-manager'

export function registerMcpRegistryHandlers(
  getCurrentFolder: () => string | null,
  getRegistry: () => McpRegistryManager,
  getConnectionManager: () => McpConnectionManager
): void {
  markChannelRegistered('mcp:listRegistry')
  markChannelRegistered('mcp:addServer')
  markChannelRegistered('mcp:updateServer')
  markChannelRegistered('mcp:removeServer')
  markChannelRegistered('mcp:setProjectEnabled')
  markChannelRegistered('mcp:testServer')
  markChannelRegistered('mcp:startOAuth')

  ipcMain.handle('mcp:listRegistry', (_event, projectFolder?: string) => {
    return getRegistry().listRegistry(projectFolder || getCurrentFolder())
  })

  ipcMain.handle(
    'mcp:addServer',
    (_event, input: McpServerInput, enableForProject?: string | null) => {
      return getRegistry().addServer(input, enableForProject || getCurrentFolder())
    }
  )

  ipcMain.handle('mcp:updateServer', (_event, id: string, input: McpServerInput) => {
    const config = getRegistry().updateServer(id, input)
    getConnectionManager().invalidate(id)
    return config
  })

  ipcMain.handle('mcp:removeServer', (_event, id: string) => {
    getConnectionManager().invalidate(id)
    getRegistry().removeServer(id)
  })

  ipcMain.handle(
    'mcp:setProjectEnabled',
    (_event, projectFolder: string, serverId: string, enabled: boolean) => {
      return getRegistry().setProjectEnabled(projectFolder, serverId, enabled)
    }
  )

  ipcMain.handle('mcp:testServer', (_event, id: string) => {
    return getConnectionManager().testServer(id)
  })

  ipcMain.handle('mcp:startOAuth', (_event, id: string) => {
    return getConnectionManager().startOAuth(id)
  })
}
