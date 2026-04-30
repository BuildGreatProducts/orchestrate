import { CronExpressionParser } from 'cron-parser'
import type { BrowserWindow } from 'electron'
import type { TaskListState, TaskSchedule } from '@shared/types'

// Node's setTimeout max is ~24.8 days; longer delays fire immediately
const MAX_TIMEOUT = 2147483647

export class TaskScheduler {
  private taskTimers = new Map<string, NodeJS.Timeout>()
  private getWindow: () => BrowserWindow | null
  private getTasks: (() => Promise<TaskListState>) | null = null
  private getProjectTasks: ((projectFolder: string) => Promise<TaskListState>) | null = null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  /** Provide a task loader so rescheduling reads fresh schedule data */
  setTaskLoader(loader: () => Promise<TaskListState>): void {
    this.getTasks = loader
  }

  setProjectTaskLoader(loader: (projectFolder: string) => Promise<TaskListState>): void {
    this.getProjectTasks = loader
  }

  private timerKey(taskId: string, projectFolder?: string | null): string {
    return `${projectFolder ?? ''}\0${taskId}`
  }

  scheduleTask(taskId: string, schedule: TaskSchedule, projectFolder?: string | null): void {
    const key = this.timerKey(taskId, projectFolder)
    this.unscheduleTask(taskId, projectFolder)
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
        key,
        setTimeout(async () => {
          this.taskTimers.delete(key)
          if (capped) {
            // Not yet time — reschedule with a fresh delay calculation
            this.scheduleTask(taskId, schedule, projectFolder)
            return
          }
          const win = this.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('task:scheduleTrigger', taskId, projectFolder ?? null)
          }
          // Re-read the latest schedule from the task list before rescheduling
          const loader =
            projectFolder && this.getProjectTasks
              ? () => this.getProjectTasks!(projectFolder)
              : this.getTasks
          if (loader) {
            try {
              const tasks = await loader()
              const fresh = tasks.tasks[taskId]?.schedule
              if (fresh) {
                this.scheduleTask(taskId, fresh, projectFolder)
              }
            } catch {
              // Fallback to the captured schedule
              this.scheduleTask(taskId, schedule, projectFolder)
            }
          } else {
            this.scheduleTask(taskId, schedule, projectFolder)
          }
        }, delay)
      )
    } catch (err) {
      console.warn(`[TaskScheduler] Invalid cron for task ${taskId}:`, err)
    }
  }

  unscheduleTask(taskId: string, projectFolder?: string | null): void {
    const key = this.timerKey(taskId, projectFolder)
    const timer = this.taskTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.taskTimers.delete(key)
    }
  }

  rescheduleAllTasks(tasks: TaskListState): void {
    this.stopAll()
    for (const [id, meta] of Object.entries(tasks.tasks)) {
      if (meta.schedule) {
        this.scheduleTask(id, meta.schedule)
      }
    }
  }

  rescheduleProjectTasks(projectFolder: string, tasks: TaskListState): void {
    this.unscheduleProjectTasks(projectFolder)
    for (const [id, meta] of Object.entries(tasks.tasks)) {
      if (meta.schedule) {
        this.scheduleTask(id, meta.schedule, projectFolder)
      }
    }
  }

  private unscheduleProjectTasks(projectFolder: string): void {
    const prefix = `${projectFolder}\0`
    for (const [key, timer] of this.taskTimers.entries()) {
      if (!key.startsWith(prefix)) continue
      clearTimeout(timer)
      this.taskTimers.delete(key)
    }
  }

  stopAll(): void {
    for (const timer of this.taskTimers.values()) {
      clearTimeout(timer)
    }
    this.taskTimers.clear()
  }
}
