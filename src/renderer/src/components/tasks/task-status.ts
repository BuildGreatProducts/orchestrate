import type { TerminalTab } from '@renderer/stores/terminal'
import type { SimpleTask } from '@shared/types'

export interface TaskDisplayStatus {
  label: string
  dotClass: string
  textClass: string
  pulse?: boolean
}

export const TASK_STATUS_STYLES = {
  todo: {
    label: 'Todo',
    dotClass: 'bg-zinc-500',
    textClass: 'text-zinc-400'
  },
  working: {
    label: 'Working',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-300',
    pulse: true
  },
  attention: {
    label: 'Needs input',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    pulse: true
  },
  idle: {
    label: 'Idle',
    dotClass: 'bg-zinc-500',
    textClass: 'text-zinc-400'
  },
  completed: {
    label: 'Completed',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-300'
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-red-400',
    textClass: 'text-red-300'
  }
} satisfies Record<string, TaskDisplayStatus>

export function linkedAgentForTask(
  task: SimpleTask,
  tabs: TerminalTab[],
  projectFolder?: string | null
): TerminalTab | undefined {
  const taskTabs = projectFolder ? tabs.filter((tab) => tab.projectFolder === projectFolder) : tabs
  const liveTaskTab = taskTabs.find((tab) => tab.taskId === task.id && !tab.exited)
  if (liveTaskTab) return liveTaskTab

  const lastRunTab = task.lastRun?.terminalId
    ? taskTabs.find((tab) => tab.id === task.lastRun?.terminalId)
    : undefined
  if (lastRunTab) return lastRunTab

  return taskTabs.find((tab) => tab.taskId === task.id)
}

export function displayStatusForTask(
  task: SimpleTask,
  agentTab: TerminalTab | undefined
): TaskDisplayStatus {
  if (agentTab) {
    if (agentTab.exited) {
      return agentTab.exitCode === 0 ? TASK_STATUS_STYLES.completed : TASK_STATUS_STYLES.failed
    }
    if (agentTab.bell) return TASK_STATUS_STYLES.attention
    if (agentTab.busy) return TASK_STATUS_STYLES.working
    return TASK_STATUS_STYLES.idle
  }

  if (task.status === 'running' || task.lastRun?.status === 'running') {
    return TASK_STATUS_STYLES.working
  }
  if (task.status === 'failed' || task.lastRun?.status === 'failed') {
    return TASK_STATUS_STYLES.failed
  }
  if (task.status === 'done' || task.status === 'review' || task.lastRun?.status === 'completed') {
    return TASK_STATUS_STYLES.completed
  }

  return TASK_STATUS_STYLES.todo
}

export function taskHasFailed(task: SimpleTask, agentTab: TerminalTab | undefined): boolean {
  return (
    task.status === 'failed' ||
    task.lastRun?.status === 'failed' ||
    Boolean(agentTab?.exited && agentTab.exitCode !== undefined && agentTab.exitCode !== 0)
  )
}

export function sortTasksForDisplay(tasks: SimpleTask[]): SimpleTask[] {
  return [...tasks].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
}
