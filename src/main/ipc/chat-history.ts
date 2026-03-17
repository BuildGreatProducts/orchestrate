import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { ChatHistoryManager } from '../chat-history-manager'
import type { ChatConversation } from '@shared/types'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid conversation ID: ${String(id)}`)
  }
}

let chatHistoryManager: ChatHistoryManager | null = null
let getCurrentFolderFn: (() => string | null) | null = null

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

  function getManager(): ChatHistoryManager {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    if (!chatHistoryManager) {
      chatHistoryManager = new ChatHistoryManager(folder)
    } else {
      chatHistoryManager.setProjectFolder(folder)
    }
    return chatHistoryManager
  }

  ipcMain.handle('chatHistory:list', async () => {
    const mgr = getManager()
    return mgr.listConversations()
  })

  ipcMain.handle('chatHistory:load', async (_, id: string) => {
    validateId(id)
    const mgr = getManager()
    return mgr.loadConversation(id)
  })

  ipcMain.handle('chatHistory:save', async (_, conversation: ChatConversation) => {
    const mgr = getManager()
    await mgr.saveConversation(conversation)
  })

  ipcMain.handle('chatHistory:delete', async (_, id: string) => {
    validateId(id)
    const mgr = getManager()
    await mgr.deleteConversation(id)
  })

  ipcMain.handle('chatHistory:rename', async (_, id: string, title: string) => {
    validateId(id)
    const mgr = getManager()
    await mgr.renameConversation(id, title)
  })
}
