import { CronExpressionParser } from 'cron-parser'
import type { BrowserWindow } from 'electron'
import type { Loop, BoardState, TaskSchedule } from '@shared/types'

export class LoopScheduler {
  private timers = new Map<string, NodeJS.Timeout>()
  private taskTimers = new Map<string, NodeJS.Timeout>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  // ── Loop scheduling ──

  scheduleLoop(loop: Loop): void {
    this.unscheduleLoop(loop.id)
    if (!loop.schedule.enabled || !loop.schedule.cron) return

    try {
      const expr = CronExpressionParser.parse(loop.schedule.cron)
      const next = expr.next().toDate()
      const delay = next.getTime() - Date.now()
      if (delay <= 0) return

      this.timers.set(
        loop.id,
        setTimeout(() => {
          const win = this.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('loop:trigger', loop.id)
          }
          // Reschedule for next occurrence
          this.scheduleLoop(loop)
        }, delay)
      )
    } catch (err) {
      console.warn(`[LoopScheduler] Invalid cron for loop ${loop.id}:`, err)
    }
  }

  unscheduleLoop(id: string): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
  }

  rescheduleAll(loops: Loop[]): void {
    this.stopAllLoops()
    for (const loop of loops) {
      this.scheduleLoop(loop)
    }
  }

  // ── Task scheduling ──

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
      console.warn(`[LoopScheduler] Invalid cron for task ${taskId}:`, err)
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
    this.stopAllTasks()
    for (const [id, meta] of Object.entries(board.tasks)) {
      if (meta.schedule) {
        this.scheduleTask(id, meta.schedule)
      }
    }
  }

  // ── Lifecycle ──

  private stopAllLoops(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  private stopAllTasks(): void {
    for (const timer of this.taskTimers.values()) {
      clearTimeout(timer)
    }
    this.taskTimers.clear()
  }

  stopAll(): void {
    this.stopAllLoops()
    this.stopAllTasks()
  }
}
