import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import {
  listCommands,
  loadCommand,
  saveCommand,
  deleteCommand,
  validateCommandId
} from '../command-manager'
import type { SavedCommand, CommandScope } from '@shared/types'

let getCurrentFolderFn: (() => string | null) | null = null

function resolveFolder(explicit?: string): string | null {
  return explicit ?? (getCurrentFolderFn ? getCurrentFolderFn() : null)
}

export function registerCommandHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  getCurrentFolderFn = getCurrentFolder

  markChannelRegistered('command:list')
  markChannelRegistered('command:load')
  markChannelRegistered('command:save')
  markChannelRegistered('command:delete')

  ipcMain.handle('command:list', async (_, projectFolder?: string) => {
    return listCommands(resolveFolder(projectFolder))
  })

  ipcMain.handle('command:load', async (_, id: string, scope: CommandScope, projectFolder?: string) => {
    validateCommandId(id)
    return loadCommand(id, scope, resolveFolder(projectFolder))
  })

  ipcMain.handle('command:save', async (_, command: SavedCommand, projectFolder?: string) => {
    await saveCommand(command, resolveFolder(projectFolder))
  })

  ipcMain.handle('command:delete', async (_, id: string, scope: CommandScope, projectFolder?: string) => {
    validateCommandId(id)
    await deleteCommand(id, scope, resolveFolder(projectFolder))
  })
}
