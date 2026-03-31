import { CronExpressionParser } from 'cron-parser'
import type { BrowserWindow } from 'electron'
import type { Loop } from '@shared/types'

export class LoopScheduler {
  private timers = new Map<string, NodeJS.Timeout>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

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
    this.stopAll()
    for (const loop of loops) {
      this.scheduleLoop(loop)
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }
}
