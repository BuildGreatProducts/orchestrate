import { nanoid } from 'nanoid'
import { useTerminalStore } from './terminal'
import { useTasksStore } from './tasks'
import { useAppStore } from './app'
import { useAgentsStore } from './agents'
import { buildAgentCommand } from '../lib/agent-command-builder'
import type { TaskRun } from '@shared/types'

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

export async function executeTask(taskId: string, agentOverride?: string): Promise<void> {
  const board = useTasksStore.getState().board
  if (!board) return
  const task = board.tasks[taskId]
  if (!task) {
    console.error('[TaskEngine] Task not found:', taskId)
    return
  }

  if (!task.steps || task.steps.length === 0) {
    console.error('[TaskEngine] Task has no steps:', taskId)
    return
  }

  if (activeExecutions.has(taskId)) {
    console.warn('[TaskEngine] Task already running:', taskId)
    return
  }

  const folder = useAppStore.getState().currentFolder
  if (!folder) {
    console.error('[TaskEngine] No project folder selected')
    return
  }

  const agentType = agentOverride || task.agentType || 'claude-code'
  const agentConfig = useAgentsStore.getState().getAgent(agentType)
  if (!agentConfig) {
    console.error('[TaskEngine] Unknown agent type:', agentType)
    return
  }

  const execution: ActiveExecution = { aborted: false, currentTabId: null, abortListeners: new Set() }
  activeExecutions.set(taskId, execution)

  const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
  const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)

  const runId = nanoid(8)
  const termStore = useTerminalStore.getState()
  const groupId = task.groupName
    ? termStore.findOrCreateGroup(task.groupName, folder)
    : termStore.createGroup(task.title, folder)

  const run: TaskRun = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    stepResults: [],
    groupId
  }

  useTasksStore.getState().updateTaskRun(taskId, run)
  useAppStore.getState().showTerminal()

  try {
    for (let stepIdx = 0; stepIdx < task.steps.length; stepIdx++) {
      const step = task.steps[stepIdx]
      if (execution.aborted) {
        run.status = 'failed'
        run.finishedAt = new Date().toISOString()
        useTasksStore.getState().updateTaskRun(taskId, { ...run })
        break
      }

      const systemPrompt = `You have orchestrate MCP tools. Your task ID is '${taskId}'. Use create_save_point to commit your changes.`

      const cmd = buildAgentCommand({
        agent: agentConfig,
        prompt: step.prompt,
        systemPrompt,
        mcpConfigPath,
        codexMcpFlags
      })

      const stepName = `Step ${stepIdx + 1}: ${step.prompt.slice(0, 40)}${step.prompt.length > 40 ? '...' : ''}`

      const stepResult = {
        stepId: step.id,
        terminalId: '',
        startedAt: new Date().toISOString(),
        finishedAt: undefined as string | undefined,
        exitCode: undefined as number | undefined
      }

      const tabId = await useTerminalStore.getState().createTabInGroup(folder, groupId, stepName, cmd)
      stepResult.terminalId = tabId
      execution.currentTabId = tabId

      const exitCode = await new Promise<number>((resolve) => {
        let resolved = false
        const done = (code: number): void => {
          if (resolved) return
          resolved = true
          unsub()
          execution.abortListeners.delete(onAbort)
          resolve(code)
        }

        const unsub = useTerminalStore.subscribe((state) => {
          const t = state.tabs.find((t) => t.id === tabId)
          if (t?.exited) done(t.exitCode ?? 1)
        })

        const onAbort = (): void => done(1)
        execution.abortListeners.add(onAbort)

        const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
        if (tab?.exited) done(tab.exitCode ?? 1)
        if (execution.aborted) done(1)
      })

      execution.currentTabId = null

      stepResult.exitCode = exitCode
      stepResult.finishedAt = new Date().toISOString()
      run.stepResults.push(stepResult)
      useTasksStore.getState().updateTaskRun(taskId, { ...run })

      if (exitCode !== 0) {
        run.status = 'failed'
        run.finishedAt = new Date().toISOString()
        useTasksStore.getState().updateTaskRun(taskId, { ...run })
        activeExecutions.delete(taskId)
        return
      }
    }

    if (run.status === 'running') {
      run.status = 'completed'
      run.finishedAt = new Date().toISOString()
      useTasksStore.getState().updateTaskRun(taskId, { ...run })
    }
  } catch (err) {
    console.error('[TaskEngine] Execution error:', err)
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    useTasksStore.getState().updateTaskRun(taskId, { ...run })
  } finally {
    activeExecutions.delete(taskId)
  }
}
