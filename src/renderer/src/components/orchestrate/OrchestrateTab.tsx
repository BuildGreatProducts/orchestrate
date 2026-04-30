import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CronExpressionParser } from 'cron-parser'
import { Clock, FolderOpen, Maximize2, Play, Plus, RotateCcw, Square, X } from 'lucide-react'
import { useAppModalLayer } from '@renderer/hooks/useAppModalLayer'
import { useMirrorTerminal } from '@renderer/hooks/useMirrorTerminal'
import { useAppStore } from '@renderer/stores/app'
import { taskExecutionKey, useTasksStore } from '@renderer/stores/tasks'
import { isTaskRunning } from '@renderer/stores/task-execution-engine'
import { useTerminalStore, type TerminalTab } from '@renderer/stores/terminal'
import {
  displayStatusForTask,
  linkedAgentForTask,
  sortTasksForDisplay,
  taskHasFailed,
  type TaskDisplayStatus
} from '@renderer/components/tasks/task-status'
import type { SimpleTask, TaskListState } from '@shared/types'

function projectName(projectFolder: string): string {
  return projectFolder.split(/[/\\]/).pop() ?? projectFolder
}

function tasksForProject(taskList: TaskListState | null): SimpleTask[] {
  if (!taskList) return []
  return sortTasksForDisplay(
    taskList.order.map((id) => taskList.tasks[id]).filter((task): task is SimpleTask => !!task)
  )
}

function nextRunLabel(cron: string): string | null {
  try {
    const next = CronExpressionParser.parse(cron).next().toDate()
    const now = new Date()
    const time = next.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (next.toDateString() === now.toDateString()) return `Today ${time}`
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (next.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
    return `${next.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`
  } catch {
    return null
  }
}

function TaskStatusIndicator({ status }: { status: TaskDisplayStatus }): React.JSX.Element {
  return (
    <div className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-950/50 px-1.5 ring-1 ring-zinc-800/70">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dotClass} ${
          status.pulse ? 'animate-pulse' : ''
        }`}
      />
      <span className={`text-[11px] font-medium leading-none ${status.textClass}`}>
        {status.label}
      </span>
    </div>
  )
}

function FocusedAgentModal({
  tabId,
  onClose
}: {
  tabId: string
  onClose: () => void
}): React.JSX.Element | null {
  const tab = useTerminalStore((s) => s.tabs.find((item) => item.id === tabId))
  const taskListsByProject = useTasksStore((s) => s.taskListsByProject)
  const { containerRef } = useMirrorTerminal({ id: tabId })
  useAppModalLayer(Boolean(tab))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!tab) return null

  const task = tab.taskId ? taskListsByProject[tab.projectFolder]?.tasks[tab.taskId] : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focused-agent-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="flex h-[min(760px,86vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex min-h-12 items-center gap-3 border-b border-zinc-800 px-4">
          <div className="min-w-0 flex-1">
            <h2 id="focused-agent-title" className="truncate text-sm font-medium text-zinc-200">
              {task?.prompt || tab.name}
            </h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="truncate">{projectName(tab.projectFolder)}</span>
              <span>/</span>
              <span className="truncate font-mono">{tab.branchName ?? 'current branch'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close focused agent"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label={`${tab.name} terminal`}
          className="min-h-0 flex-1 overflow-hidden bg-black"
          style={{ padding: '4px 0 0 4px' }}
        />
      </section>
    </div>,
    document.body
  )
}

function CompactTaskCard({
  projectFolder,
  task,
  tabs,
  onOpenAgent,
  onStartTask
}: {
  projectFolder: string
  task: SimpleTask
  tabs: TerminalTab[]
  onOpenAgent: (tabId: string) => void
  onStartTask: (projectFolder: string, task: SimpleTask) => void
}): React.JSX.Element {
  const stopTask = useTasksStore((s) => s.stopTask)
  const agentTab = linkedAgentForTask(task, tabs, projectFolder)
  const displayStatus = displayStatusForTask(task, agentTab)
  const failed = taskHasFailed(task, agentTab)
  const running =
    isTaskRunning(task.id, projectFolder) ||
    task.status === 'running' ||
    Boolean(agentTab && !agentTab.exited)
  const liveAgentTab = agentTab && !agentTab.exited ? agentTab : undefined
  const scheduledRunLabel = task.schedule?.enabled
    ? (nextRunLabel(task.schedule.cron) ?? task.schedule.cron)
    : null

  const handleRunToggle = (): void => {
    if (running) {
      stopTask(task.id, projectFolder)
      return
    }
    onStartTask(projectFolder, task)
  }
  const openAttachedAgent = (): void => {
    if (liveAgentTab) onOpenAgent(liveAgentTab.id)
  }
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!liveAgentTab) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAttachedAgent()
    }
  }

  return (
    <article
      role={liveAgentTab ? 'button' : undefined}
      tabIndex={liveAgentTab ? 0 : undefined}
      onClick={openAttachedAgent}
      onKeyDown={handleCardKeyDown}
      className={`rounded-lg bg-zinc-800/80 transition-colors hover:bg-zinc-800 ${
        liveAgentTab ? 'cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-500' : ''
      }`}
      title={liveAgentTab ? 'Open attached agent' : undefined}
    >
      <div className="flex min-h-14 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {scheduledRunLabel && (
            <div
              className="mb-1.5 flex min-w-0 items-center gap-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-zinc-500"
              title={`Next run: ${scheduledRunLabel}`}
            >
              <Clock size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{scheduledRunLabel}</span>
            </div>
          )}
          <div
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-zinc-200"
            title={task.prompt}
          >
            <span className="truncate">{task.prompt || 'Untitled task'}</span>
          </div>
          <div className="mt-1">
            <TaskStatusIndicator status={displayStatus} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {liveAgentTab && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpenAgent(liveAgentTab.id)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
              aria-label="Open attached agent"
              title="Open attached agent"
            >
              <Maximize2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleRunToggle()
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium transition-colors ${
              running
                ? 'text-red-300 hover:bg-zinc-900'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white'
            }`}
            aria-label={running ? 'Stop task' : failed ? 'Rerun task' : 'Start task'}
            title={running ? 'Stop task' : failed ? 'Rerun task' : 'Start task'}
          >
            {running ? <Square size={13} /> : failed ? <RotateCcw size={13} /> : <Play size={13} />}
          </button>
        </div>
      </div>
    </article>
  )
}

function ProjectColumn({
  projectFolder,
  onOpenAgent,
  onStartTask
}: {
  projectFolder: string
  onOpenAgent: (tabId: string) => void
  onStartTask: (projectFolder: string, task: SimpleTask) => void
}): React.JSX.Element {
  const taskList = useTasksStore((s) => s.taskListsByProject[projectFolder] ?? null)
  const isLoading = useTasksStore((s) => s.loadingByProject[projectFolder] ?? false)
  const loadError = useTasksStore((s) => s.loadErrorsByProject[projectFolder] ?? null)
  const openComposer = useTasksStore((s) => s.openComposer)
  const showProjectDetail = useAppStore((s) => s.showProjectDetail)
  const tabs = useTerminalStore((s) => s.tabs)
  const tasks = useMemo(() => tasksForProject(taskList), [taskList])
  const projectTabs = useMemo(
    () => tabs.filter((tab) => tab.projectFolder === projectFolder),
    [projectFolder, tabs]
  )

  return (
    <section className="flex max-h-full w-[330px] shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-900">
      <div className="flex h-12 min-h-12 items-center gap-2 border-b border-zinc-900 px-3">
        <button
          type="button"
          onClick={() => void showProjectDetail(projectFolder)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-white"
          title={projectFolder}
        >
          <FolderOpen size={14} className="shrink-0 text-zinc-500" />
          <span className="truncate text-sm font-medium text-zinc-200">
            {projectName(projectFolder)}
          </span>
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] font-medium leading-none text-zinc-400">
            {tasks.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => openComposer('manual', null, projectFolder)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label={`New task in ${projectName(projectFolder)}`}
          title="New task"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto p-2.5 dark-scrollbar">
        {isLoading && !taskList && (
          <div className="px-2 py-5 text-sm text-zinc-500">Loading tasks...</div>
        )}
        {loadError && <div className="px-2 py-5 text-sm text-red-300">{loadError}</div>}
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <CompactTaskCard
              key={task.id}
              projectFolder={projectFolder}
              task={task}
              tabs={projectTabs}
              onOpenAgent={onOpenAgent}
              onStartTask={onStartTask}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function OrchestrateTab(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const tabs = useTerminalStore((s) => s.tabs)
  const [focusedTerminalId, setFocusedTerminalId] = useState<string | null>(null)
  const [pendingOpenKey, setPendingOpenKey] = useState<string | null>(null)

  useEffect(() => {
    for (const projectFolder of projects) {
      void loadTasks(projectFolder)
    }
  }, [loadTasks, projects])

  useEffect(() => {
    if (!pendingOpenKey) return
    const tab = tabs.find(
      (item) =>
        item.taskId &&
        item.kind === 'agent' &&
        !item.exited &&
        taskExecutionKey(item.projectFolder, item.taskId) === pendingOpenKey
    )
    if (!tab) return
    const frame = requestAnimationFrame(() => {
      setFocusedTerminalId(tab.id)
      setPendingOpenKey(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingOpenKey, tabs])

  const handleOpenAgent = (tabId: string): void => {
    setFocusedTerminalId(tabId)
  }

  const handleStartAndOpen = (projectFolder: string, task: SimpleTask): void => {
    const key = taskExecutionKey(projectFolder, task.id)
    setPendingOpenKey(key)
    window.setTimeout(() => {
      setPendingOpenKey((current) => (current === key ? null : current))
    }, 8000)
    void useTasksStore
      .getState()
      .startTask(task.id, undefined, { projectFolder, navigateOnStart: false })
      .catch((err) => {
        setPendingOpenKey(null)
        console.error('[Orchestrate] Failed to start task:', err)
      })
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm text-zinc-500">
            Add projects to orchestrate tasks and agents from one place.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 px-2 py-8">
        <div className="shrink-0 text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
          <p className="mt-1 text-sm text-zinc-500">Tasks and agents across all projects.</p>
        </div>
        <div className="min-h-0 max-w-full overflow-x-auto overflow-y-hidden dark-scrollbar">
          <div className="mx-auto flex w-max items-start gap-3">
            {projects.map((projectFolder) => (
              <ProjectColumn
                key={projectFolder}
                projectFolder={projectFolder}
                onOpenAgent={handleOpenAgent}
                onStartTask={handleStartAndOpen}
              />
            ))}
          </div>
        </div>
      </div>
      {focusedTerminalId && (
        <FocusedAgentModal tabId={focusedTerminalId} onClose={() => setFocusedTerminalId(null)} />
      )}
    </div>
  )
}
