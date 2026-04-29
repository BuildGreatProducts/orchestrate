import { nanoid } from 'nanoid'
import { useTerminalStore } from './terminal'
import { useTasksStore } from './tasks'
import { useAppStore } from './app'
import { useAgentsStore } from './agents'
import { useHistoryStore } from './history'
import { useWorktreeStore } from './worktree'
import { buildAgentCommand } from '../lib/agent-command-builder'
import { toast } from './toast'
import type { AgentType, SimpleTask, SimpleTaskRun } from '@shared/types'

interface ActiveExecution {
  aborted: boolean
  currentTabId: string | null
  abortListeners: Set<() => void>
}

const activeExecutions = new Map<string, ActiveExecution>()

export function isTaskRunning(taskId: string): boolean {
  return activeExecutions.has(taskId)
}

export function abortTask(taskId: string): void {
  const exec = activeExecutions.get(taskId)
  if (!exec) return
  exec.aborted = true
  if (exec.currentTabId) {
    useTerminalStore.getState().closeTab(exec.currentTabId)
  }
  for (const listener of exec.abortListeners) {
    listener()
  }
}

function promptForTask(task: SimpleTask): string {
  return task.mode === 'plan' ? `help me plan this: ${task.prompt}` : task.prompt
}

async function resolveTaskWorktree(
  folder: string,
  task: SimpleTask
): Promise<{ branchName: string; worktreePath: string | undefined }> {
  const branchName = task.branchName.trim() || `orchestrate/task-${task.id}`
  const worktreeStore = useWorktreeStore.getState()
  await worktreeStore.loadWorktrees(folder)
  const existing = (useWorktreeStore.getState().worktrees[folder] ?? []).find(
    (item) => item.branch === branchName
  )
  if (existing) {
    return { branchName, worktreePath: existing.isMain ? undefined : existing.path }
  }
  const worktreePath = await worktreeStore.addWorktree(folder, branchName)
  return { branchName, worktreePath }
}

async function waitForTerminalExit(execution: ActiveExecution, tabId: string): Promise<number> {
  return new Promise<number>((resolve) => {
    let resolved = false
    const done = (code: number): void => {
      if (resolved) return
      resolved = true
      unsub()
      execution.abortListeners.delete(onAbort)
      resolve(code)
    }

    const unsub = useTerminalStore.subscribe((state) => {
      const tab = state.tabs.find((item) => item.id === tabId)
      if (tab?.exited) done(tab.exitCode ?? 1)
    })

    const onAbort = (): void => done(1)
    execution.abortListeners.add(onAbort)

    const tab = useTerminalStore.getState().tabs.find((item) => item.id === tabId)
    if (tab?.exited) done(tab.exitCode ?? 1)
    if (execution.aborted) done(1)
  })
}

export async function executeTask(
  taskId: string,
  agentOverride?: AgentType
): Promise<SimpleTaskRun | null> {
  const taskList = useTasksStore.getState().taskList
  const task = taskList?.tasks[taskId]
  if (!task) {
    console.error('[TaskEngine] Task not found:', taskId)
    return null
  }

  if (activeExecutions.has(taskId)) {
    toast.error('Agent already running for this task')
    return null
  }

  const folder = useAppStore.getState().currentFolder
  if (!folder) {
    toast.error('No project folder selected')
    return null
  }

  const agentType = agentOverride || task.agentType || 'claude-code'
  const agentConfig = useAgentsStore.getState().getAgent(agentType)
  if (!agentConfig) {
    toast.error(`Unknown agent: ${agentType}`)
    return null
  }

  const execution: ActiveExecution = {
    aborted: false,
    currentTabId: null,
    abortListeners: new Set()
  }
  activeExecutions.set(taskId, execution)

  const run: SimpleTaskRun = {
    id: nanoid(8),
    startedAt: new Date().toISOString(),
    status: 'running'
  }

  try {
    await window.orchestrate.sendToAgent(taskId, agentType)
    await useTasksStore.getState().updateTaskRun(taskId, run, 'running')

    const { branchName, worktreePath } = await resolveTaskWorktree(folder, task)
    run.worktreePath = worktreePath

    const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
    const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
    const systemPrompt = [
      `You have orchestrate MCP tools. Your task ID is '${taskId}'.`,
      'Use create_save_point to commit your changes.',
      'Pass task_id to file and git MCP tools when you want them scoped to this task run.'
    ].join('\n\n')

    const command = buildAgentCommand({
      agent: agentConfig,
      prompt: promptForTask(task),
      systemPrompt,
      mcpConfigPath,
      codexMcpFlags
    })

    const tabName = `${agentConfig.displayName}: ${task.prompt.slice(0, 44)}${task.prompt.length > 44 ? '...' : ''}`
    const tabId = await useTerminalStore.getState().createTab({
      cwd: folder,
      name: tabName,
      command,
      kind: 'agent',
      taskId,
      branchName,
      launchMode: worktreePath ? 'worktree' : 'direct',
      worktreePath
    })

    run.terminalId = tabId
    await useTasksStore.getState().updateTaskRun(taskId, { ...run }, 'running')
    useTasksStore.getState().markActiveAgentTask(taskId, tabId, agentType)
    execution.currentTabId = tabId
    await useAppStore.getState().showTerminal(folder)

    const exitCode = await waitForTerminalExit(execution, tabId)
    execution.currentTabId = null
    run.exitCode = exitCode
    run.finishedAt = new Date().toISOString()
    run.status = exitCode === 0 ? 'completed' : 'failed'
    await useTasksStore
      .getState()
      .updateTaskRun(taskId, { ...run }, exitCode === 0 ? 'done' : 'failed')

    if (exitCode === 0) {
      useHistoryStore.getState().refreshAll()
    }

    return run
  } catch (err) {
    console.error('[TaskEngine] Execution error:', err)
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    await useTasksStore.getState().updateTaskRun(taskId, { ...run }, 'failed')
    toast.error(`Failed to start task: ${err instanceof Error ? err.message : String(err)}`)
    return run
  } finally {
    activeExecutions.delete(taskId)
    useTasksStore.getState().clearActiveAgentTask(taskId)
  }
}
