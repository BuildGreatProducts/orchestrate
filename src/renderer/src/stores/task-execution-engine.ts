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
import { taskExecutionKey } from './tasks'

interface ActiveExecution {
  aborted: boolean
  currentTabId: string | null
  abortListeners: Set<() => void>
}

const activeExecutions = new Map<string, ActiveExecution>()

function resolveProjectFolder(projectFolder?: string | null): string | null {
  return projectFolder ?? useAppStore.getState().currentFolder
}

function executionKey(taskId: string, projectFolder?: string | null): string | null {
  const folder = resolveProjectFolder(projectFolder)
  return folder ? taskExecutionKey(folder, taskId) : null
}

export function isTaskRunning(taskId: string, projectFolder?: string | null): boolean {
  const key = executionKey(taskId, projectFolder)
  return key ? activeExecutions.has(key) : false
}

export function abortTask(taskId: string, projectFolder?: string | null): void {
  const folder = resolveProjectFolder(projectFolder)
  if (!folder) return
  const key = taskExecutionKey(folder, taskId)
  const exec = activeExecutions.get(key)
  if (!exec) {
    stopLinkedTaskTerminal(taskId, folder)
    return
  }
  exec.aborted = true
  if (exec.currentTabId) {
    useTerminalStore.getState().closeTab(exec.currentTabId)
  }
  for (const listener of exec.abortListeners) {
    listener()
  }
}

function stopLinkedTaskTerminal(taskId: string, folder: string): void {
  const terminalStore = useTerminalStore.getState()
  const linkedTab = terminalStore.tabs.find(
    (tab) => tab.projectFolder === folder && tab.taskId === taskId && !tab.exited
  )
  if (linkedTab) {
    terminalStore.closeTab(linkedTab.id)
  }

  const tasksStore = useTasksStore.getState()
  const task = tasksStore.taskListsByProject[folder]?.tasks[taskId]
  const shouldMarkStopped =
    Boolean(linkedTab) || task?.status === 'running' || task?.lastRun?.status === 'running'
  if (!task || !shouldMarkStopped) return

  const now = new Date().toISOString()
  void tasksStore.updateTaskRun(
    taskId,
    {
      ...(task.lastRun ?? {
        id: `stopped-${Date.now().toString(36)}`,
        startedAt: now
      }),
      terminalId: linkedTab?.id ?? task.lastRun?.terminalId,
      status: 'failed',
      exitCode: 1,
      finishedAt: now
    },
    'failed',
    folder
  )
  tasksStore.clearActiveAgentTask(taskId, folder)
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
      if (!tab) done(1)
      if (tab?.exited) done(tab.exitCode ?? 1)
    })

    const onAbort = (): void => done(1)
    execution.abortListeners.add(onAbort)

    const tab = useTerminalStore.getState().tabs.find((item) => item.id === tabId)
    if (!tab) done(1)
    if (tab?.exited) done(tab.exitCode ?? 1)
    if (execution.aborted) done(1)
  })
}

async function sendTaskToAgent(
  folder: string,
  taskId: string,
  agentType: AgentType
): Promise<{ restoreActiveProject: string | null } | null> {
  if (typeof window.orchestrate.sendToAgentForProject === 'function') {
    try {
      await window.orchestrate.sendToAgentForProject(folder, taskId, agentType)
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('No handler registered')) throw err
      console.warn('[TaskEngine] sendToAgentForProject unavailable; using active-project fallback')
    }
  }

  const restoreActiveProject = useAppStore.getState().currentFolder
  await window.orchestrate.setActiveProject(folder)
  await window.orchestrate.sendToAgent(taskId, agentType)
  return { restoreActiveProject }
}

export async function executeTask(
  taskId: string,
  agentOverride?: AgentType,
  options: { projectFolder?: string | null; navigateOnStart?: boolean } = {}
): Promise<SimpleTaskRun | null> {
  const folder = resolveProjectFolder(options.projectFolder)
  if (!folder) {
    toast.error('No project folder selected')
    return null
  }

  const tasksStore = useTasksStore.getState()
  if (!tasksStore.taskListsByProject[folder]) {
    await tasksStore.loadTasks(folder)
  }

  const taskList = useTasksStore.getState().taskListsByProject[folder]
  const task = taskList?.tasks[taskId]
  if (!task) {
    console.error('[TaskEngine] Task not found:', taskId)
    return null
  }

  const key = taskExecutionKey(folder, taskId)
  if (activeExecutions.has(key)) {
    toast.error('Agent already running for this task')
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
  activeExecutions.set(key, execution)

  const run: SimpleTaskRun = {
    id: nanoid(8),
    startedAt: new Date().toISOString(),
    status: 'running'
  }

  let legacyActiveProjectScope: { restoreActiveProject: string | null } | null = null

  try {
    legacyActiveProjectScope = await sendTaskToAgent(folder, taskId, agentType)
    await useTasksStore.getState().updateTaskRun(taskId, run, 'running', folder)

    const { branchName, worktreePath } = await resolveTaskWorktree(folder, task)
    run.worktreePath = worktreePath

    const mcpConfigPath =
      typeof window.orchestrate.getMcpConfigPathForProject === 'function'
        ? await window.orchestrate.getMcpConfigPathForProject(folder, taskId).catch(() => null)
        : await window.orchestrate.getMcpConfigPath().catch(() => null)
    const codexMcpFlags =
      typeof window.orchestrate.getCodexMcpFlagsForProject === 'function'
        ? await window.orchestrate.getCodexMcpFlagsForProject(folder, taskId).catch(() => null)
        : await window.orchestrate.getCodexMcpFlags().catch(() => null)
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
    await useTasksStore.getState().updateTaskRun(taskId, { ...run }, 'running', folder)
    useTasksStore.getState().markActiveAgentTask(taskId, tabId, agentType, folder)
    execution.currentTabId = tabId
    if (options.navigateOnStart !== false) {
      await useAppStore.getState().showTerminal(folder)
    }

    const exitCode = await waitForTerminalExit(execution, tabId)
    execution.currentTabId = null
    run.exitCode = exitCode
    run.finishedAt = new Date().toISOString()
    run.status = exitCode === 0 ? 'completed' : 'failed'
    await useTasksStore
      .getState()
      .updateTaskRun(taskId, { ...run }, exitCode === 0 ? 'done' : 'failed', folder)

    if (exitCode === 0) {
      useHistoryStore.getState().refreshAll()
    }

    return run
  } catch (err) {
    console.error('[TaskEngine] Execution error:', err)
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    await useTasksStore.getState().updateTaskRun(taskId, { ...run }, 'failed', folder)
    toast.error(`Failed to start task: ${err instanceof Error ? err.message : String(err)}`)
    return run
  } finally {
    activeExecutions.delete(key)
    useTasksStore.getState().clearActiveAgentTask(taskId, folder)
    if (legacyActiveProjectScope) {
      window.orchestrate
        .setActiveProject(legacyActiveProjectScope.restoreActiveProject)
        .catch((err) => {
          console.error('[TaskEngine] Failed to restore active project after task run:', err)
        })
    }
  }
}
