import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { getGitManager } from './git'
import { TaskManager } from '../task-manager'
import type { AgentType, BoardState, TaskListState } from '@shared/types'
import type { PtyManager } from '../pty-manager'
import type { TaskScheduler } from '../task-scheduler'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function validateTaskId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid task ID: ${String(id)}`)
  }
}

let taskManager: TaskManager | null = null
let getCurrentFolderFn: (() => string | null) | null = null

/**
 * Returns the TaskManager with its folder synchronized to the current folder.
 * Safe to call from other IPC modules (e.g., agent).
 */
export function getTaskManager(): TaskManager | null {
  if (!getCurrentFolderFn) return null
  const folder = getCurrentFolderFn()
  if (!folder) return null
  if (!taskManager) {
    taskManager = new TaskManager(folder)
  } else {
    taskManager.setProjectFolder(folder)
  }
  return taskManager
}

export function registerTaskHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null,
  _getPtyManager: () => PtyManager | null,
  scheduler?: TaskScheduler
): void {
  getCurrentFolderFn = getCurrentFolder
  markChannelRegistered('task:loadTasks')
  markChannelRegistered('task:saveTasks')
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

  ipcMain.handle('task:loadTasks', async () => {
    const mgr = getManager()
    return mgr.loadTasks()
  })

  ipcMain.handle('task:saveTasks', async (_, tasks: TaskListState) => {
    const mgr = getManager()
    await mgr.saveTasks(tasks)
    try {
      scheduler?.rescheduleAllTasks(tasks)
    } catch (err) {
      console.error('[Tasks] Failed to reschedule tasks:', err)
    }
  })

  ipcMain.handle('task:loadBoard', async () => {
    const mgr = getManager()
    return mgr.loadBoard()
  })

  ipcMain.handle('task:saveBoard', async (_, board: BoardState) => {
    const mgr = getManager()
    await mgr.saveBoard(board)
  })

  ipcMain.handle('task:readMarkdown', async (_, id: string) => {
    validateTaskId(id)
    const mgr = getManager()
    return mgr.readMarkdown(id)
  })

  ipcMain.handle('task:writeMarkdown', async (_, id: string, content: string) => {
    validateTaskId(id)
    const mgr = getManager()
    await mgr.writeMarkdown(id, content)
  })

  ipcMain.handle('task:delete', async (_, id: string) => {
    try {
      validateTaskId(id)
      const mgr = getManager()
      const tasks = await mgr.loadTasks()
      const deleted = Boolean(tasks.tasks[id])
      if (deleted) {
        tasks.order = tasks.order.filter((taskId) => taskId !== id)
        delete tasks.tasks[id]
        await mgr.saveTasks(tasks)
        try {
          scheduler?.rescheduleAllTasks(tasks)
        } catch (err) {
          console.error('[Tasks] Failed to reschedule tasks after delete:', err)
        }
      }
      return { success: true, id, deleted }
    } catch (err) {
      return {
        success: false,
        id: typeof id === 'string' ? id : undefined,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('task:sendToAgent', async (_, id: string, _agent: AgentType) => {
    void _agent
    validateTaskId(id)
    const mgr = getManager()
    const tasks = await mgr.loadTasks()
    if (!tasks.tasks[id]) {
      throw new Error(`Task ${id} not found`)
    }

    const gitMgr = getGitManager()
    if (gitMgr) {
      try {
        const isRepo = await gitMgr.isRepo()
        if (isRepo) await gitMgr.autoSaveBeforeAgent(tasks.tasks[id].prompt.slice(0, 80))
      } catch (err) {
        console.warn('[Tasks] Auto-save failed:', err)
      }
    }
  })
}
