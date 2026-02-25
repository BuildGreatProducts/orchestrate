import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { TaskManager } from '../task-manager'
import type { BoardState, AgentType } from '@shared/types'
import type { PtyManager } from '../pty-manager'

let taskManager: TaskManager | null = null

export function registerTaskHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null,
  _getPtyManager: () => PtyManager | null
): void {
  markChannelRegistered('task:loadBoard')
  markChannelRegistered('task:saveBoard')
  markChannelRegistered('task:readMarkdown')
  markChannelRegistered('task:writeMarkdown')
  markChannelRegistered('task:delete')
  markChannelRegistered('task:sendToAgent')

  function getManager(): TaskManager {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    if (!taskManager) {
      taskManager = new TaskManager(folder)
    } else {
      taskManager.setProjectFolder(folder)
    }
    return taskManager
  }

  ipcMain.handle('task:loadBoard', async () => {
    const mgr = getManager()
    return mgr.loadBoard()
  })

  ipcMain.handle('task:saveBoard', async (_, board: BoardState) => {
    const mgr = getManager()
    await mgr.saveBoard(board)
  })

  ipcMain.handle('task:readMarkdown', async (_, id: string) => {
    const mgr = getManager()
    return mgr.readMarkdown(id)
  })

  ipcMain.handle('task:writeMarkdown', async (_, id: string, content: string) => {
    const mgr = getManager()
    await mgr.writeMarkdown(id, content)
  })

  ipcMain.handle('task:delete', async (_, id: string) => {
    const mgr = getManager()
    await mgr.deleteMarkdown(id)
  })

  ipcMain.handle('task:sendToAgent', async (_, id: string, _agent: AgentType) => {
    // Validate that the task exists
    const mgr = getManager()
    const board = await mgr.loadBoard()
    if (!board.tasks[id]) {
      throw new Error(`Task ${id} not found`)
    }
    // Phase 5.11: auto-save point logic will be added here
  })
}
