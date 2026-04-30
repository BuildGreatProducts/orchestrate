import { ipcMain, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { getGitManager } from './git'
import { TaskManager } from '../task-manager'
import { GitManager } from '../git-manager'
import type { AgentType, BoardState, TaskListState } from '@shared/types'
import type { PtyManager } from '../pty-manager'
import type { TaskScheduler } from '../task-scheduler'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function validateTaskId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid task ID: ${String(id)}`)
  }
}

function validateProjectFolder(projectFolder: unknown): asserts projectFolder is string {
  if (typeof projectFolder !== 'string' || projectFolder.trim().length === 0) {
    throw new Error('Project folder is required')
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

export function getTaskManagerForProject(projectFolder: string): TaskManager {
  validateProjectFolder(projectFolder)
  return new TaskManager(projectFolder)
}

export function registerTaskHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null,
  _getPtyManager: () => PtyManager | null,
  scheduler?: TaskScheduler
): void {
  getCurrentFolderFn = getCurrentFolder
  markChannelRegistered('task:loadTasks')
  markChannelRegistered('task:loadTasksForProject')
  markChannelRegistered('task:saveTasks')
  markChannelRegistered('task:saveTasksForProject')
  markChannelRegistered('task:loadBoard')
  markChannelRegistered('task:saveBoard')
  markChannelRegistered('task:readMarkdown')
  markChannelRegistered('task:writeMarkdown')
  markChannelRegistered('task:delete')
  markChannelRegistered('task:sendToAgent')
  markChannelRegistered('task:sendToAgentForProject')

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

  function getManagerForProject(projectFolder: unknown): TaskManager {
    validateProjectFolder(projectFolder)
    return new TaskManager(projectFolder)
  }

  async function sendTaskToAgent(projectFolder: string, id: string): Promise<void> {
    validateTaskId(id)
    const mgr = getManagerForProject(projectFolder)
    const tasks = await mgr.loadTasks()
    if (!tasks.tasks[id]) {
      throw new Error(`Task ${id} not found`)
    }

    try {
      const gitMgr =
        projectFolder === getCurrentFolder() ? getGitManager() : new GitManager(projectFolder)
      if (gitMgr) {
        const isRepo = await gitMgr.isRepo()
        if (isRepo) await gitMgr.autoSaveBeforeAgent(tasks.tasks[id].prompt.slice(0, 80))
      }
    } catch (err) {
      console.warn('[Tasks] Auto-save failed:', err)
    }
  }

  ipcMain.handle('task:loadTasks', async () => {
    const mgr = getManager()
    return mgr.loadTasks()
  })

  ipcMain.handle('task:loadTasksForProject', async (_, projectFolder: string) => {
    const mgr = getManagerForProject(projectFolder)
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

  ipcMain.handle(
    'task:saveTasksForProject',
    async (_, projectFolder: string, tasks: TaskListState) => {
      const mgr = getManagerForProject(projectFolder)
      await mgr.saveTasks(tasks)
      if (projectFolder === getCurrentFolder()) {
        try {
          scheduler?.rescheduleAllTasks(tasks)
        } catch (err) {
          console.error('[Tasks] Failed to reschedule tasks:', err)
        }
      }
    }
  )

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
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')
    await sendTaskToAgent(folder, id)
  })

  ipcMain.handle(
    'task:sendToAgentForProject',
    async (_, projectFolder: string, id: string, _agent: AgentType) => {
      void _agent
      await sendTaskToAgent(projectFolder, id)
    }
  )
}
