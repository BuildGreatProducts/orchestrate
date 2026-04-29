/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { CronExpressionParser } from 'cron-parser'
import {
  GitBranch,
  Hammer,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { useAgentsStore } from '@renderer/stores/agents'
import { useTasksStore } from '@renderer/stores/tasks'
import { isTaskRunning } from '@renderer/stores/task-execution-engine'
import { useTerminalStore, type TerminalTab } from '@renderer/stores/terminal'
import { useAppModalLayer } from '@renderer/hooks/useAppModalLayer'
import DropdownSelect from '@renderer/components/ui/DropdownSelect'
import { AgentIcon } from '@renderer/lib/agent-icons'
import type { AgentConfig, BranchInfo, SimpleTask, TaskMode, TaskSchedule } from '@shared/types'

interface TasksSidebarProps {
  projectFolder: string
}

const SCHEDULE_PRESETS = [
  { label: 'Daily 10:00', value: '0 10 * * *' },
  { label: 'Weekdays 10:00', value: '0 10 * * 1-5' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Custom', value: '__custom__' }
]

const FIELD_CLASS =
  'h-7 w-full min-w-0 rounded-md bg-zinc-800/70 px-2 text-[11px] leading-none text-zinc-300 outline-none transition-colors placeholder:text-zinc-600 hover:bg-zinc-800 focus:bg-zinc-800 disabled:cursor-default disabled:opacity-45'
interface TaskDisplayStatus {
  label: string
  dotClass: string
  textClass: string
  pulse?: boolean
}

const TASK_STATUS_STYLES = {
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

function cronFrequency(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts
  if (minute === '0' && hour === '10' && dayOfMonth === '*' && dayOfWeek === '*')
    return 'Daily 10:00'
  if (minute === '0' && hour === '10' && dayOfMonth === '*' && dayOfWeek === '1-5') {
    return 'Weekdays 10:00'
  }
  if (/^\d+$/.test(minute) && hour === '*') return 'Hourly'
  return cron
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

function linkedAgentForTask(task: SimpleTask, tabs: TerminalTab[]): TerminalTab | undefined {
  const liveTaskTab = tabs.find((tab) => tab.taskId === task.id && !tab.exited)
  if (liveTaskTab) return liveTaskTab

  const lastRunTab = task.lastRun?.terminalId
    ? tabs.find((tab) => tab.id === task.lastRun?.terminalId)
    : undefined
  if (lastRunTab) return lastRunTab

  return tabs.find((tab) => tab.taskId === task.id)
}

function displayStatusForTask(
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

function taskHasFailed(task: SimpleTask, agentTab: TerminalTab | undefined): boolean {
  return (
    task.status === 'failed' ||
    task.lastRun?.status === 'failed' ||
    Boolean(agentTab?.exited && (agentTab.exitCode ?? 1) !== 0)
  )
}

function sortTasksForDisplay(tasks: SimpleTask[]): SimpleTask[] {
  return [...tasks].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
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

function TaskPromptLabel({
  task,
  onOpen
}: {
  task: SimpleTask
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-7 min-w-0 flex-1 items-center truncate text-left text-sm font-medium leading-none text-zinc-200 transition-colors hover:text-white"
      title={task.prompt}
    >
      {task.prompt || 'Untitled task'}
    </button>
  )
}

function TaskEmptyState({
  title,
  description
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="px-3 py-8 text-center">
      <h3 className="font-ovo text-2xl tracking-tight text-zinc-300">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
    </div>
  )
}

interface AgentOption {
  id: string
  displayName: string
}

function agentOptionsForTask(task: SimpleTask, agents: AgentConfig[]): AgentOption[] {
  const enabled = agents
    .filter((agent) => agent.enabled)
    .map((agent) => ({ id: agent.id, displayName: agent.displayName }))
  const current = agents.find((agent) => agent.id === task.agentType)

  if (current && !enabled.some((agent) => agent.id === current.id)) {
    enabled.unshift({ id: current.id, displayName: current.displayName })
  }

  if (!enabled.some((agent) => agent.id === task.agentType)) {
    enabled.unshift({ id: task.agentType, displayName: task.agentType })
  }

  return enabled.length > 0 ? enabled : [{ id: 'claude-code', displayName: 'Claude Code' }]
}

function agentTrailingIcon(agentId: string): ReactNode {
  return agentId === 'claude-code' || agentId === 'codex' ? (
    <AgentIcon agentId={agentId} />
  ) : undefined
}

function schedulePresetFor(schedule: TaskSchedule | undefined): string {
  if (!schedule?.enabled || !schedule.cron) return SCHEDULE_PRESETS[0].value
  return SCHEDULE_PRESETS.some((preset) => preset.value === schedule.cron)
    ? schedule.cron
    : '__custom__'
}

function TaskScheduleControl({
  task,
  disabled
}: {
  task: SimpleTask
  disabled: boolean
}): React.JSX.Element {
  const updateTask = useTasksStore((s) => s.updateTask)
  const [selectedPreset, setSelectedPreset] = useState(schedulePresetFor(task.schedule))
  const [customCron, setCustomCron] = useState(task.schedule?.cron || SCHEDULE_PRESETS[0].value)
  const scheduleEnabled = task.schedule?.enabled
  const scheduleCron = task.schedule?.cron
  const selectedCron = selectedPreset === '__custom__' ? customCron : selectedPreset

  useEffect(() => {
    const schedule =
      scheduleEnabled && scheduleCron ? { enabled: true, cron: scheduleCron } : undefined
    setSelectedPreset(schedulePresetFor(schedule))
    setCustomCron(scheduleCron || SCHEDULE_PRESETS[0].value)
  }, [scheduleCron, scheduleEnabled])

  const commitCustomCron = useCallback(() => {
    if (disabled) return
    const cron = customCron.trim() || SCHEDULE_PRESETS[0].value
    setCustomCron(cron)
    if (cron !== scheduleCron) {
      void updateTask(task.id, { schedule: { enabled: true, cron } })
    }
  }, [customCron, disabled, scheduleCron, task.id, updateTask])

  return (
    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
      <DropdownSelect
        ariaLabel="Schedule"
        value={selectedPreset}
        disabled={disabled}
        options={SCHEDULE_PRESETS}
        onChange={(value) => {
          setSelectedPreset(value)
          if (value === '__custom__') {
            return
          }
          void updateTask(task.id, { schedule: { enabled: true, cron: value } })
        }}
      />
      <div className="flex h-7 items-center text-[11px] text-zinc-600">
        {nextRunLabel(selectedCron) ?? cronFrequency(selectedCron)}
      </div>
      {selectedPreset === '__custom__' && (
        <input
          aria-label="Custom cron"
          value={customCron}
          disabled={disabled}
          onChange={(event) => setCustomCron(event.target.value)}
          onBlur={commitCustomCron}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setCustomCron(task.schedule?.cron || SCHEDULE_PRESETS[0].value)
              event.currentTarget.blur()
            }
          }}
          className={`${FIELD_CLASS} col-span-2 font-mono`}
          placeholder="0 10 * * *"
        />
      )}
    </div>
  )
}

interface TaskDialogProps {
  branches: BranchInfo[]
  agents: AgentConfig[]
}

function TaskDialog({ branches, agents }: TaskDialogProps): React.JSX.Element | null {
  const taskList = useTasksStore((s) => s.taskList)
  const composerOpen = useTasksStore((s) => s.composerOpen)
  const composerKind = useTasksStore((s) => s.composerKind)
  const editingTaskId = useTasksStore((s) => s.editingTaskId)
  const closeComposer = useTasksStore((s) => s.closeComposer)
  const createTask = useTasksStore((s) => s.createTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  useAppModalLayer(composerOpen)

  const editingTask = editingTaskId ? taskList?.tasks[editingTaskId] : undefined
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
  const fallbackAgentId = enabledAgents[0]?.id ?? editingTask?.agentType ?? 'claude-code'
  const isScheduled = composerKind === 'scheduled'

  const [prompt, setPrompt] = useState('')
  const [branchName, setBranchName] = useState('')
  const [mode, setMode] = useState<TaskMode>('build')
  const [agentType, setAgentType] = useState(fallbackAgentId)
  const [schedulePreset, setSchedulePreset] = useState(SCHEDULE_PRESETS[0].value)
  const [customCron, setCustomCron] = useState(SCHEDULE_PRESETS[0].value)

  useEffect(() => {
    if (!composerOpen) return
    setPrompt(editingTask?.prompt ?? '')
    setBranchName(editingTask?.branchName ?? '')
    setMode(editingTask?.mode ?? 'build')
    setAgentType(editingTask?.agentType ?? fallbackAgentId)
    setSchedulePreset(schedulePresetFor(editingTask?.schedule))
    setCustomCron(editingTask?.schedule?.cron || SCHEDULE_PRESETS[0].value)
    requestAnimationFrame(() => promptRef.current?.focus())
  }, [composerOpen, editingTask, fallbackAgentId])

  useEffect(() => {
    if (!composerOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeComposer()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeComposer, composerOpen])

  if (!composerOpen) return null

  const localBranches = branches.filter((branch) => !branch.isRemote)
  const cron = schedulePreset === '__custom__' ? customCron.trim() : schedulePreset
  const canSubmit = prompt.trim().length > 0

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!canSubmit) return

    const payload = {
      prompt,
      mode,
      branchName,
      agentType,
      schedule: isScheduled ? { enabled: true, cron: cron || SCHEDULE_PRESETS[0].value } : undefined
    }

    if (editingTask) {
      await updateTask(editingTask.id, payload)
    } else {
      await createTask(payload)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeComposer()
      }}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mx-4 w-full max-w-md rounded-lg bg-zinc-900 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 id="task-dialog-title" className="text-sm font-medium text-zinc-200">
            {editingTask ? 'Edit task' : isScheduled ? 'New scheduled task' : 'New task'}
          </h3>
          <button
            type="button"
            onClick={closeComposer}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Prompt</span>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="Describe the task..."
              className="w-full resize-none rounded-md bg-zinc-800/70 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:bg-zinc-800 focus:bg-zinc-800"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Mode</span>
              <DropdownSelect
                ariaLabel="Mode"
                value={mode}
                variant="field"
                options={[
                  { value: 'build', label: 'Build', icon: <Hammer size={13} /> },
                  { value: 'plan', label: 'Plan', icon: <ListChecks size={13} /> }
                ]}
                onChange={(value) => setMode(value as TaskMode)}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Agent</span>
              <DropdownSelect
                ariaLabel="Agent"
                value={agentType}
                variant="field"
                searchPlaceholder="Filter agents..."
                options={agentOptionsForTask(
                  editingTask ?? {
                    id: 'new',
                    prompt,
                    mode,
                    status: 'todo',
                    branchName,
                    agentType,
                    createdAt: '',
                    updatedAt: ''
                  },
                  agents
                ).map((agent) => ({
                  value: agent.id,
                  label: agent.displayName,
                  trailingIcon: agentTrailingIcon(agent.id)
                }))}
                onChange={setAgentType}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Branch</span>
            <DropdownSelect
              ariaLabel="Branch"
              value={branchName}
              variant="field"
              leadingIcon={<GitBranch size={14} />}
              monospaced
              placeholder="Auto-create task branch"
              searchPlaceholder="Filter or type branch..."
              noOptionsLabel="No branches found"
              allowCustomValue
              customActionLabel={(value) => <>Use branch &ldquo;{value}&rdquo;</>}
              options={localBranches.map((branch) => ({
                value: branch.name,
                label: branch.name,
                icon: <GitBranch size={11} />,
                meta: branch.current ? (
                  <span className="text-[10px] text-zinc-600">current</span>
                ) : undefined
              }))}
              onChange={setBranchName}
            />
          </label>

          {isScheduled && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Schedule</span>
                <DropdownSelect
                  ariaLabel="Schedule"
                  value={schedulePreset}
                  variant="field"
                  options={SCHEDULE_PRESETS}
                  onChange={(value) => {
                    setSchedulePreset(value)
                    if (value !== '__custom__') setCustomCron(value)
                  }}
                />
              </label>
              <div className="flex items-end pb-2 text-xs text-zinc-500">
                {nextRunLabel(cron || SCHEDULE_PRESETS[0].value) ?? ''}
              </div>
              {schedulePreset === '__custom__' && (
                <input
                  value={customCron}
                  onChange={(event) => setCustomCron(event.target.value)}
                  placeholder="0 10 * * *"
                  className="col-span-2 h-9 rounded-md bg-zinc-800/70 px-2 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:bg-zinc-800 focus:bg-zinc-800"
                />
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeComposer}
            className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40"
          >
            {editingTask ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}

function TaskRow({
  task,
  branches,
  agents
}: {
  task: SimpleTask
  branches: BranchInfo[]
  agents: AgentConfig[]
}): React.JSX.Element {
  const startTask = useTasksStore((s) => s.startTask)
  const stopTask = useTasksStore((s) => s.stopTask)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const openComposer = useTasksStore((s) => s.openComposer)
  const tabs = useTerminalStore((s) => s.tabs)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsStyle, setActionsStyle] = useState<CSSProperties>({})
  const actionsButtonRef = useRef<HTMLButtonElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const agentTab = linkedAgentForTask(task, tabs)
  const displayStatus = displayStatusForTask(task, agentTab)
  const failed = taskHasFailed(task, agentTab)
  const running =
    isTaskRunning(task.id) || task.status === 'running' || Boolean(agentTab && !agentTab.exited)
  const agentOptions = useMemo(() => agentOptionsForTask(task, agents), [agents, task])
  const branchOptions = useMemo(() => {
    const branchNames = branches.filter((branch) => !branch.isRemote).map((branch) => branch.name)
    if (task.branchName && !branchNames.includes(task.branchName)) {
      branchNames.unshift(task.branchName)
    }
    return branchNames.map((branchName) => ({
      value: branchName,
      label: branchName,
      icon: <GitBranch size={11} />
    }))
  }, [branches, task.branchName])
  const openTaskEditor = useCallback(() => {
    openComposer(task.schedule?.enabled ? 'scheduled' : 'manual', task.id)
  }, [openComposer, task.id, task.schedule?.enabled])
  const toggleTaskPin = useCallback(() => {
    void updateTask(task.id, { pinned: !task.pinned })
  }, [task.id, task.pinned, updateTask])
  const unpinTask = useCallback(() => {
    void updateTask(task.id, { pinned: false })
  }, [task.id, updateTask])
  const openActionsMenu = useCallback(() => {
    const rect = actionsButtonRef.current?.getBoundingClientRect()
    if (!rect) {
      setActionsOpen(true)
      return
    }
    const menuWidth = 156
    const menuHeight = 128
    setActionsStyle({
      position: 'fixed',
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)),
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      zIndex: 9999,
      width: menuWidth
    })
    setActionsOpen(true)
  }, [])

  useEffect(() => {
    if (!actionsOpen) return

    const handleMouseDown = (event: MouseEvent): void => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(event.target as Node) &&
        actionsButtonRef.current &&
        !actionsButtonRef.current.contains(event.target as Node)
      ) {
        setActionsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setActionsOpen(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen])

  return (
    <article className="rounded-md bg-zinc-800/70 p-3 transition-colors hover:bg-zinc-800/85">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TaskStatusIndicator status={displayStatus} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {task.pinned && (
            <button
              type="button"
              onClick={unpinTask}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label="Unpin task"
              title="Unpin task"
            >
              <Pin size={13} fill="currentColor" strokeWidth={1.8} />
            </button>
          )}
          <button
            ref={actionsButtonRef}
            type="button"
            onClick={() => (actionsOpen ? setActionsOpen(false) : openActionsMenu())}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Task actions"
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            title="Task actions"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <TaskPromptLabel task={task} onOpen={openTaskEditor} />
        <button
          type="button"
          onClick={() => (running ? stopTask(task.id) : startTask(task.id))}
          className={`flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors ${
            running
              ? 'text-red-300 hover:bg-zinc-800'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white'
          }`}
        >
          {running ? (
            <>
              Stop
              <Square size={13} />
            </>
          ) : failed ? (
            <>
              Rerun
              <RotateCcw size={13} />
            </>
          ) : (
            <>
              Start
              <Play size={13} />
            </>
          )}
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_66px_minmax(106px,1.08fr)] gap-1.5">
        <DropdownSelect
          ariaLabel="Branch"
          value={task.branchName}
          disabled={running}
          leadingIcon={<GitBranch size={11} />}
          monospaced
          searchPlaceholder="Filter or type branch..."
          noOptionsLabel="No branches found"
          allowCustomValue
          customActionLabel={(value) => <>Use branch &ldquo;{value}&rdquo;</>}
          options={branchOptions}
          onChange={(value) => void updateTask(task.id, { branchName: value })}
        />
        <DropdownSelect
          ariaLabel="Mode"
          value={task.mode}
          disabled={running}
          options={[
            { value: 'build', label: 'Build', icon: <Hammer size={11} /> },
            { value: 'plan', label: 'Plan', icon: <ListChecks size={11} /> }
          ]}
          onChange={(value) => void updateTask(task.id, { mode: value as TaskMode })}
        />
        <DropdownSelect
          ariaLabel="Agent"
          value={task.agentType}
          disabled={running}
          options={agentOptions.map((agent) => ({
            value: agent.id,
            label: agent.displayName,
            trailingIcon: agentTrailingIcon(agent.id)
          }))}
          searchPlaceholder="Filter agents..."
          onChange={(value) => void updateTask(task.id, { agentType: value })}
        />
      </div>

      {task.schedule?.enabled && <TaskScheduleControl task={task} disabled={running} />}

      {actionsOpen &&
        createPortal(
          <div
            ref={actionsMenuRef}
            style={actionsStyle}
            role="menu"
            className="overflow-hidden rounded-md bg-zinc-800 py-1 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleTaskPin()
                setActionsOpen(false)
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              <Pin
                size={12}
                fill={task.pinned ? 'currentColor' : 'none'}
                className="text-zinc-500"
              />
              {task.pinned ? 'Unpin task' : 'Pin task'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openTaskEditor()
                setActionsOpen(false)
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              <Pencil size={12} className="text-zinc-500" />
              Edit task
            </button>
            <div className="my-1 border-t border-zinc-700" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void deleteTask(task.id)
                setActionsOpen(false)
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-red-300 transition-colors hover:bg-red-950/50 hover:text-red-200"
            >
              <Trash2 size={12} />
              Delete task
            </button>
          </div>,
          document.body
        )}
    </article>
  )
}

export default function TasksSidebar({ projectFolder }: TasksSidebarProps): React.JSX.Element {
  const taskList = useTasksStore((s) => s.taskList)
  const isLoading = useTasksStore((s) => s.isLoading)
  const loadError = useTasksStore((s) => s.loadError)
  const openComposer = useTasksStore((s) => s.openComposer)
  const agents = useAgentsStore((s) => s.agents)
  const [branches, setBranches] = useState<BranchInfo[]>([])

  useEffect(() => {
    let active = true
    window.orchestrate
      .listBranches(projectFolder)
      .then((list) => {
        if (active) setBranches(list)
      })
      .catch(() => {
        if (active) setBranches([])
      })
    return () => {
      active = false
    }
  }, [projectFolder])

  const { manualTasks, scheduledTasks } = useMemo(() => {
    const tasks = taskList
      ? taskList.order.map((id) => taskList.tasks[id]).filter((task): task is SimpleTask => !!task)
      : []
    return {
      manualTasks: sortTasksForDisplay(tasks.filter((task) => !task.schedule?.enabled)),
      scheduledTasks: sortTasksForDisplay(tasks.filter((task) => task.schedule?.enabled))
    }
  }, [taskList])

  const taskCount = manualTasks.length + scheduledTasks.length

  return (
    <aside className="flex h-full min-h-0 w-[340px] max-w-[34vw] shrink-0 flex-col overflow-hidden bg-black">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-ovo text-lg tracking-tight text-zinc-200">Tasks</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] font-medium leading-none text-zinc-400">
            {taskCount}
          </span>
        </div>
        <button
          type="button"
          onClick={() => openComposer('manual')}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label="New task"
          title="New task"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto dark-scrollbar p-2.5">
        {isLoading && <div className="px-2 py-5 text-sm text-zinc-500">Loading tasks...</div>}
        {loadError && <div className="px-2 py-5 text-sm text-red-300">{loadError}</div>}

        {!isLoading && !loadError && manualTasks.length === 0 && (
          <TaskEmptyState title="No Tasks" description="New work items will appear here." />
        )}
        <div className="flex flex-col gap-1.5">
          {manualTasks.map((task) => (
            <TaskRow key={task.id} task={task} branches={branches} agents={agents} />
          ))}
        </div>

        <div className="mt-3 flex h-8 items-center justify-between px-1">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Scheduled
          </h3>
          <button
            type="button"
            onClick={() => openComposer('scheduled')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="New scheduled task"
            title="New scheduled task"
          >
            <Plus size={15} />
          </button>
        </div>

        {!isLoading && !loadError && scheduledTasks.length === 0 && (
          <TaskEmptyState
            title="No Scheduled Tasks"
            description="Recurring work items will appear here."
          />
        )}
        <div className="flex flex-col gap-1.5">
          {scheduledTasks.map((task) => (
            <TaskRow key={task.id} task={task} branches={branches} agents={agents} />
          ))}
        </div>
      </div>
      <TaskDialog branches={branches} agents={agents} />
    </aside>
  )
}
