import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { ChatHistoryManager, validateConversationId } from '../chat-history-manager'
import type { ChatConversation } from '@shared/types'

let chatHistoryManager: ChatHistoryManager | null = null
let getCurrentFolderFn: (() => string | null) | null = null

// Fix #9: single source of truth for manager creation/sync
export function getChatHistoryManager(): ChatHistoryManager | null {
  if (!getCurrentFolderFn) return null
  const folder = getCurrentFolderFn()
  if (!folder) return null
  if (!chatHistoryManager) {
    chatHistoryManager = new ChatHistoryManager(folder)
  } else {
    chatHistoryManager.setProjectFolder(folder)
  }
  return chatHistoryManager
}

function getManager(): ChatHistoryManager {
  const mgr = getChatHistoryManager()
  if (!mgr) throw new Error('No project folder selected')
  return mgr
}

export function registerChatHistoryHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  getCurrentFolderFn = getCurrentFolder

  markChannelRegistered('chatHistory:list')
  markChannelRegistered('chatHistory:load')
  markChannelRegistered('chatHistory:save')
  markChannelRegistered('chatHistory:delete')
  markChannelRegistered('chatHistory:rename')

  ipcMain.handle('chatHistory:list', async () => {
    const mgr = getManager()
    return mgr.listConversations()
  })

  ipcMain.handle('chatHistory:load', async (_, id: string) => {
    validateConversationId(id)
    const mgr = getManager()
    return mgr.loadConversation(id)
  })

  ipcMain.handle('chatHistory:save', async (_, conversation: ChatConversation) => {
    const mgr = getManager()
    await mgr.saveConversation(conversation)
  })

  ipcMain.handle('chatHistory:delete', async (_, id: string) => {
    validateConversationId(id)
    const mgr = getManager()
    await mgr.deleteConversation(id)
  })

  ipcMain.handle('chatHistory:rename', async (_, id: string, title: string) => {
    validateConversationId(id)
    const mgr = getManager()
    await mgr.renameConversation(id, title)
  })
}
