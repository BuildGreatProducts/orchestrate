import { nanoid } from 'nanoid'
import { useTerminalStore } from './terminal'
import { useLoopsStore } from './loops'
import { useAppStore } from './app'
import type { LoopRun } from '@shared/types'

interface ActiveExecution {
  aborted: boolean
  currentTabId: string | null
  abortListeners: Set<() => void>
}

const activeExecutions = new Map<string, ActiveExecution>()

export function isLoopRunning(loopId: string): boolean {
  return activeExecutions.has(loopId)
}

export function abortLoop(loopId: string): void {
  const exec = activeExecutions.get(loopId)
  if (!exec) return
  exec.aborted = true
  // Kill the currently running terminal process
  if (exec.currentTabId) {
    useTerminalStore.getState().closeTab(exec.currentTabId)
  }
  // Wake up any pending exit-wait so the loop doesn't stay stuck
  for (const listener of exec.abortListeners) {
    listener()
  }
}

export async function executeLoop(loopId: string): Promise<void> {
  const loop = useLoopsStore.getState().loops.find((l) => l.id === loopId)
  if (!loop) {
    console.error('[LoopEngine] Loop not found:', loopId)
    return
  }

  if (activeExecutions.has(loopId)) {
    console.warn('[LoopEngine] Loop already running:', loopId)
    return
  }

  const folder = useAppStore.getState().currentFolder
  if (!folder) {
    console.error('[LoopEngine] No project folder selected')
    return
  }

  const execution: ActiveExecution = { aborted: false, currentTabId: null, abortListeners: new Set() }
  activeExecutions.set(loopId, execution)

  // Fetch MCP config once for all steps
  const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
  const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
  const shellQuote = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'"

  const runId = nanoid(8)
  const termStore = useTerminalStore.getState()
  const groupId = loop.groupName
    ? termStore.findOrCreateGroup(loop.groupName, folder!)
    : termStore.createGroup(loop.name, folder!)

  const run: LoopRun = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    stepResults: [],
    groupId
  }

  useLoopsStore.getState().updateLoopRun(loopId, run)

  // Switch to terminal view to show progress
  useAppStore.getState().showTerminal()

  try {
    for (const step of loop.steps) {
      if (execution.aborted) {
        run.status = 'failed'
        run.finishedAt = new Date().toISOString()
        useLoopsStore.getState().updateLoopRun(loopId, { ...run })
        break
      }

      const systemPrompt = 'You have orchestrate MCP tools. Use create_save_point to commit your changes.'
      const escaped = step.prompt.replace(/'/g, "'\\''")
      let cmd: string

      if (loop.agentType === 'claude-code') {
        cmd = mcpConfigPath
          ? `claude --mcp-config ${shellQuote(mcpConfigPath)} --append-system-prompt ${shellQuote(systemPrompt)} '${escaped}'`
          : `claude '${escaped}'`
      } else {
        cmd = codexMcpFlags
          ? `codex ${codexMcpFlags} '${escaped}'`
          : `codex '${escaped}'`
      }

      const stepName = `Step ${loop.steps.indexOf(step) + 1}: ${step.prompt.slice(0, 40)}${step.prompt.length > 40 ? '...' : ''}`

      const stepResult = {
        stepId: step.id,
        terminalId: '',
        startedAt: new Date().toISOString(),
        finishedAt: undefined as string | undefined,
        exitCode: undefined as number | undefined
      }

      // Create terminal tab in the group with the command
      const tabId = await useTerminalStore.getState().createTabInGroup(folder, groupId, stepName, cmd)
      stepResult.terminalId = tabId
      execution.currentTabId = tabId

      // Wait for exit by subscribing to store changes, or abort signal
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

        // Check if already exited or already aborted
        const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
        if (tab?.exited) done(tab.exitCode ?? 1)
        if (execution.aborted) done(1)
      })

      execution.currentTabId = null

      stepResult.exitCode = exitCode
      stepResult.finishedAt = new Date().toISOString()
      run.stepResults.push(stepResult)
      useLoopsStore.getState().updateLoopRun(loopId, { ...run })

      if (exitCode !== 0) {
        run.status = 'failed'
        run.finishedAt = new Date().toISOString()
        useLoopsStore.getState().updateLoopRun(loopId, { ...run })
        activeExecutions.delete(loopId)
        return
      }
    }

    if (run.status === 'running') {
      run.status = 'completed'
      run.finishedAt = new Date().toISOString()
      useLoopsStore.getState().updateLoopRun(loopId, { ...run })
    }
  } catch (err) {
    console.error('[LoopEngine] Execution error:', err)
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    useLoopsStore.getState().updateLoopRun(loopId, { ...run })
  } finally {
    activeExecutions.delete(loopId)
  }
}
