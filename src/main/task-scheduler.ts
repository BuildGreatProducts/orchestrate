import { CronExpressionParser } from 'cron-parser'
import type { BrowserWindow } from 'electron'
import type { BoardState, TaskSchedule } from '@shared/types'

// Node's setTimeout max is ~24.8 days; longer delays fire immediately
const MAX_TIMEOUT = 2147483647

export class TaskScheduler {
  private taskTimers = new Map<string, NodeJS.Timeout>()
  private getWindow: () => BrowserWindow | null
  private getBoard: (() => Promise<BoardState>) | null = null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  /** Provide a board loader so rescheduling reads fresh schedule data */
  setBoardLoader(loader: () => Promise<BoardState>): void {
    this.getBoard = loader
  }

  scheduleTask(taskId: string, schedule: TaskSchedule): void {
    this.unscheduleTask(taskId)
    if (!schedule.enabled || !schedule.cron) return

    try {
      const expr = CronExpressionParser.parse(schedule.cron)
      const next = expr.next().toDate()
      let delay = next.getTime() - Date.now()
      if (delay <= 0) return

      // Cap at MAX_TIMEOUT; if the real delay is longer, re-check when the capped timer fires
      const capped = delay > MAX_TIMEOUT
      if (capped) delay = MAX_TIMEOUT

      this.taskTimers.set(
        taskId,
        setTimeout(async () => {
          if (capped) {
            // Not yet time — reschedule with a fresh delay calculation
            this.scheduleTask(taskId, schedule)
            return
          }
          const win = this.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('task:scheduleTrigger', taskId)
          }
          // Re-read the latest schedule from the board before rescheduling
          if (this.getBoard) {
            try {
              const board = await this.getBoard()
              const fresh = board.tasks[taskId]?.schedule
              if (fresh) {
                this.scheduleTask(taskId, fresh)
              }
            } catch {
              // Fallback to the captured schedule
              this.scheduleTask(taskId, schedule)
            }
          } else {
            this.scheduleTask(taskId, schedule)
          }
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
