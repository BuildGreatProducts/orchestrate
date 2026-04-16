import { CronExpressionParser } from 'cron-parser'
import type { BrowserWindow } from 'electron'
import type { BoardState, TaskSchedule } from '@shared/types'

export class TaskScheduler {
  private taskTimers = new Map<string, NodeJS.Timeout>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  scheduleTask(taskId: string, schedule: TaskSchedule): void {
    this.unscheduleTask(taskId)
    if (!schedule.enabled || !schedule.cron) return

    try {
      const expr = CronExpressionParser.parse(schedule.cron)
      const next = expr.next().toDate()
      const delay = next.getTime() - Date.now()
      if (delay <= 0) return

      this.taskTimers.set(
        taskId,
        setTimeout(() => {
          const win = this.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('task:scheduleTrigger', taskId)
          }
          this.scheduleTask(taskId, schedule)
        }, delay)
      )
    } catch (err) {
      console.warn(`[TaskScheduler] Invalid cron for task ${taskId}:`, err)
    }
  }

  unscheduleTask(taskId: string): void {
    const timer = this.taskTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.taskTimers.delete(taskId)
    }
  }

  rescheduleAllTasks(board: BoardState): void {
    this.stopAll()
    for (const [id, meta] of Object.entries(board.tasks)) {
      if (meta.schedule) {
        this.scheduleTask(id, meta.schedule)
      }
    }
  }

  stopAll(): void {
    for (const timer of this.taskTimers.values()) {
      clearTimeout(timer)
    }
    this.taskTimers.clear()
  }
}
