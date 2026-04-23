/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { ArrowLeft, Play, Square } from 'lucide-react'
import type { ColumnId } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAgentsStore } from '@renderer/stores/agents'
import { executeTask, isTaskRunning, abortTask } from '@renderer/stores/task-execution-engine'
import AgentSelector from '@renderer/components/shared/AgentSelector'
import MarkdownToggle from '@renderer/components/files/MarkdownToggle'
import MarkdownPreview from '@renderer/components/files/MarkdownPreview'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'
import StepsList from './StepsList'

const SCHEDULE_PRESETS = [
  { label: 'Manual (no schedule)', cron: '' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Custom', cron: '__custom__' }
]

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' }
]

export default function TaskDetailView(): React.JSX.Element | null {
  const viewingTaskId = useTasksStore((s) => s.viewingTaskId)
  const board = useTasksStore((s) => s.board)
  const closeTaskDetail = useTasksStore((s) => s.closeTaskDetail)
  const updateTaskTitle = useTasksStore((s) => s.updateTaskTitle)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const moveTask = useTasksStore((s) => s.moveTask)
  const readMarkdown = useTasksStore((s) => s.readMarkdown)
  const writeMarkdown = useTasksStore((s) => s.writeMarkdown)
  const sendToAgent = useTasksStore((s) => s.sendToAgent)
  const updateTaskSchedule = useTasksStore((s) => s.updateTaskSchedule)
  const updateTaskGroup = useTasksStore((s) => s.updateTaskGroup)
  const selectedStepId = useTasksStore((s) => s.selectedStepId)
  const selectStep = useTasksStore((s) => s.selectStep)
  const addStep = useTasksStore((s) => s.addStep)
  const updateStep = useTasksStore((s) => s.updateStep)
  const deleteStep = useTasksStore((s) => s.deleteStep)
  const reorderSteps = useTasksStore((s) => s.reorderSteps)
  const terminalGroups = useTerminalStore((s) => s.groups)
  const allAgents = useAgentsStore((s) => s.agents)
  const enabledAgents = useMemo(() => allAgents.filter((a) => a.enabled), [allAgents])

  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [stepPrompt, setStepPrompt] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [viewMode, setViewMode] = useState<'raw' | 'pretty'>('raw')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [scheduleAgent, setScheduleAgent] = useState(() => enabledAgents[0]?.id ?? 'claude-code')
  const [scheduleCron, setScheduleCron] = useState('')
  const [schedulePreset, setSchedulePreset] = useState('')
  const [groupSelect, setGroupSelect] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const sendMenuRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestMarkdownRef = useRef(markdown)
  const latestStepPromptRef = useRef(stepPrompt)

  useEffect(() => {
    latestMarkdownRef.current = markdown
    latestStepPromptRef.current = stepPrompt
  }, [markdown, stepPrompt])

  const task = viewingTaskId && board ? board.tasks[viewingTaskId] : null
  const steps = task?.steps ?? []
  const hasSteps = steps.length > 0
  const selectedStep = selectedStepId ? steps.find((s) => s.id === selectedStepId) : null
  const running = viewingTaskId ? isTaskRunning(viewingTaskId) || task?.lastRun?.status === 'running' : false

  // Find current column
  let currentColumn: ColumnId | null = null
  if (viewingTaskId && board) {
    for (const col of COLUMNS) {
      if (board.columns[col.id].includes(viewingTaskId)) {
        currentColumn = col.id
        break
      }
    }
  }

  // Load task data when selection changes
  useEffect(() => {
    if (!viewingTaskId || !task) return
    let cancelled = false
    setTitle(task.title)
    setSaveStatus('idle')

    // Sync group state
    const gn = task.groupName ?? ''
    setNewGroupName('')
    setGroupSelect(gn || '')

    // Sync schedule state
    const ids = useAgentsStore.getState().agents.filter((a) => a.enabled).map((a) => a.id)
    const preferred = task.agentType
    setScheduleAgent(preferred && ids.includes(preferred) ? preferred : ids[0] ?? 'claude-code')
    const cron = task.schedule?.cron ?? ''
    setScheduleCron(cron)
    if (!task.schedule?.enabled || !cron) {
      setSchedulePreset('')
    } else {
      const match = SCHEDULE_PRESETS.find((p) => p.cron === cron)
      setSchedulePreset(match ? match.cron : '__custom__')
    }

    readMarkdown(viewingTaskId).then((content) => {
      if (!cancelled) setMarkdown(content)
    })
    return () => { cancelled = true }
  }, [viewingTaskId, task, readMarkdown])

  // Load step prompt when selected step changes or prompt is updated externally
  useEffect(() => {
    if (selectedStep) {
      setStepPrompt(selectedStep.prompt)
    }
  }, [selectedStep?.id, selectedStep?.prompt])

  // Flush pending save on unmount or task switch
  useEffect(() => {
    return () => { clearTimeout(saveTimerRef.current) }
  }, [viewingTaskId])

  // Close menus on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    if (!sendMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) setSendMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sendMenuOpen])

  const scheduleAutosave = useCallback(
    (taskId: string, content: string) => {
      clearTimeout(saveTimerRef.current)
      setSaveStatus('saving')
      saveTimerRef.current = setTimeout(async () => {
        await writeMarkdown(taskId, content)
        if (latestMarkdownRef.current === content) setSaveStatus('saved')
      }, 500)
    },
    [writeMarkdown]
  )

  const scheduleStepAutosave = useCallback(
    (taskId: string, stepId: string, prompt: string) => {
      clearTimeout(saveTimerRef.current)
      setSaveStatus('saving')
      saveTimerRef.current = setTimeout(async () => {
        await updateStep(taskId, stepId, prompt)
        if (latestStepPromptRef.current === prompt) setSaveStatus('saved')
      }, 500)
    },
    [updateStep]
  )

  const handleTitleBlur = useCallback(() => {
    if (viewingTaskId && title !== task?.title) {
      updateTaskTitle(viewingTaskId, title)
    }
  }, [viewingTaskId, title, task?.title, updateTaskTitle])

  const handleColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!viewingTaskId) return
      const newCol = e.target.value as ColumnId
      if (newCol !== currentColumn) moveTask(viewingTaskId, newCol, 0)
    },
    [viewingTaskId, currentColumn, moveTask]
  )

  const handleSendToAgent = useCallback(
    async (agent: string) => {
      if (!viewingTaskId) return
      clearTimeout(saveTimerRef.current)
      // Save current editor content before sending
      if (selectedStepId && selectedStep) {
        await updateStep(viewingTaskId, selectedStepId, stepPrompt)
      } else {
        await writeMarkdown(viewingTaskId, markdown)
      }
      setSaveStatus('saved')

      if (hasSteps) {
        executeTask(viewingTaskId, agent)
      } else {
        await sendToAgent(viewingTaskId, agent)
      }
    },
    [viewingTaskId, markdown, stepPrompt, selectedStepId, selectedStep, hasSteps, writeMarkdown, sendToAgent, updateStep]
  )

  const handleSchedulePresetChange = useCallback(
    (value: string) => {
      if (!viewingTaskId) return
      setSchedulePreset(value)
      if (value === '') {
        setScheduleCron('')
        updateTaskSchedule(viewingTaskId, { enabled: false, cron: '' }, scheduleAgent)
      } else if (value !== '__custom__') {
        setScheduleCron(value)
        updateTaskSchedule(viewingTaskId, { enabled: true, cron: value }, scheduleAgent)
      }
    },
    [viewingTaskId, scheduleAgent, updateTaskSchedule]
  )

  const commitCustomCron = useCallback(() => {
    if (!viewingTaskId) return
    const trimmed = scheduleCron.trim()
    updateTaskSchedule(viewingTaskId, { enabled: trimmed.length > 0, cron: trimmed }, scheduleAgent)
  }, [viewingTaskId, scheduleCron, scheduleAgent, updateTaskSchedule])

  const handleScheduleAgentChange = useCallback(
    (agent: string) => {
      if (!viewingTaskId) return
      setScheduleAgent(agent)
      const enabled = schedulePreset !== '' && schedulePreset !== '__custom__'
        ? true
        : schedulePreset === '__custom__' && scheduleCron.trim().length > 0
      updateTaskSchedule(viewingTaskId, { enabled, cron: scheduleCron }, agent)
    },
    [viewingTaskId, schedulePreset, scheduleCron, updateTaskSchedule]
  )

  const handleGroupSelectChange = useCallback(
    (value: string) => {
      if (!viewingTaskId) return
      setGroupSelect(value)
      if (value === '' || value === '__new__') {
        if (value === '') updateTaskGroup(viewingTaskId, undefined)
      } else {
        updateTaskGroup(viewingTaskId, value)
      }
    },
    [viewingTaskId, updateTaskGroup]
  )

  const handleNewGroupCommit = useCallback(
    (name: string) => {
      if (!viewingTaskId) return
      const trimmed = name.trim()
      if (trimmed) {
        setGroupSelect(trimmed)
        updateTaskGroup(viewingTaskId, trimmed)
      } else {
        setGroupSelect('')
        updateTaskGroup(viewingTaskId, undefined)
      }
    },
    [viewingTaskId, updateTaskGroup]
  )

  const handleAddStep = useCallback(() => {
    if (viewingTaskId) addStep(viewingTaskId, '')
  }, [viewingTaskId, addStep])

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      if (viewingTaskId) deleteStep(viewingTaskId, stepId)
    },
    [viewingTaskId, deleteStep]
  )

  const handleReorderSteps = useCallback(
    (oldIdx: number, newIdx: number) => {
      if (viewingTaskId) reorderSteps(viewingTaskId, oldIdx, newIdx)
    },
    [viewingTaskId, reorderSteps]
  )

  const handleRun = useCallback(() => {
    if (viewingTaskId) executeTask(viewingTaskId)
  }, [viewingTaskId])

  const handleStop = useCallback(() => {
    if (viewingTaskId) abortTask(viewingTaskId)
  }, [viewingTaskId])

  if (!viewingTaskId || !task) return null

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button
          onClick={closeTaskDetail}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Back to board"
        >
          <ArrowLeft size={18} />
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="min-w-0 flex-1 bg-transparent font-ovo text-xl text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder="Task name"
        />
        <div className="flex items-center gap-1">
          {/* Run/Stop for multi-step tasks */}
          {hasSteps && (
            running ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-red-400 hover:bg-zinc-800"
              >
                <Square size={12} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-green-400 hover:bg-zinc-800"
              >
                <Play size={12} />
                Run
              </button>
            )
          )}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3.5" r="1.25" />
                <circle cx="8" cy="8" r="1.25" />
                <circle cx="8" cy="12.5" r="1.25" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-32 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                <button
                  onClick={() => { setMenuOpen(false); setConfirmingDelete(true) }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: metadata + steps */}
        <div className="flex w-1/3 min-w-[280px] max-w-[400px] flex-col gap-4 overflow-y-auto border-r border-zinc-800 p-4">
          {/* Column selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Column</label>
            <select
              value={currentColumn ?? ''}
              onChange={handleColumnChange}
              className="rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
            >
              {COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Agent group */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Agent Group</label>
            {(() => {
              const selectVal = groupSelect === '__new__' ? '__new__' : (groupSelect || '')
              const savedName = selectVal && selectVal !== '__new__' ? selectVal : null
              const existsInGroups = savedName && terminalGroups.some((g) => g.name === savedName)
              return (
                <select
                  value={selectVal}
                  onChange={(e) => handleGroupSelectChange(e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
                >
                  <option value="">None</option>
                  {savedName && !existsInGroups && <option value={savedName}>{savedName}</option>}
                  {terminalGroups.map((g) => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                  <option value="__new__">+ Create new group</option>
                </select>
              )
            })()}
            {groupSelect === '__new__' && (
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onBlur={() => handleNewGroupCommit(newGroupName)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNewGroupCommit(newGroupName) }}
                placeholder="Group name"
                autoFocus
                className="mt-1.5 w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Schedule</label>
            <select
              value={schedulePreset}
              onChange={(e) => handleSchedulePresetChange(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron} value={p.cron}>{p.label}</option>
              ))}
            </select>
            {schedulePreset === '__custom__' && (
              <input
                type="text"
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                onBlur={commitCustomCron}
                onKeyDown={(e) => { if (e.key === 'Enter') commitCustomCron() }}
                placeholder="e.g. 0 9 * * 1-5"
                className="mt-1.5 w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}
            {schedulePreset !== '' && (
              <div className="mt-2">
                <label className="mb-1 block text-xs text-zinc-500">Agent</label>
                <AgentSelector value={scheduleAgent} onChange={handleScheduleAgentChange} size="sm" />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Steps */}
          {hasSteps ? (
            <StepsList
              steps={steps}
              selectedStepId={selectedStepId}
              onSelect={selectStep}
              onDelete={handleDeleteStep}
              onReorder={handleReorderSteps}
              onAdd={handleAddStep}
            />
          ) : (
            <div>
              <label className="mb-2 block text-xs text-zinc-500">Steps</label>
              <p className="text-xs text-zinc-600">No steps yet. Add steps to create a multi-step workflow.</p>
              <button
                onClick={handleAddStep}
                className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Add step
              </button>
            </div>
          )}
        </div>

        {/* Right column: editor */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
            <label className="text-xs text-zinc-500">
              {selectedStep ? `Step ${steps.indexOf(selectedStep) + 1} Instructions` : 'Description (Markdown)'}
            </label>
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' && <span className="text-xs text-zinc-500">Saving...</span>}
              {saveStatus === 'saved' && <span className="text-xs text-zinc-500">Saved</span>}
              {!selectedStep && <MarkdownToggle viewMode={viewMode} onToggle={setViewMode} />}
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden">
            {selectedStep ? (
              <Editor
                height="100%"
                language="markdown"
                theme="vs-dark"
                value={stepPrompt}
                onChange={(value) => {
                  const content = value ?? ''
                  setStepPrompt(content)
                  if (viewingTaskId && selectedStepId) {
                    scheduleStepAutosave(viewingTaskId, selectedStepId, content)
                  }
                }}
                options={{
                  wordWrap: 'on',
                  lineNumbers: 'off',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  padding: { top: 12, bottom: 12 }
                }}
              />
            ) : viewMode === 'pretty' ? (
              <MarkdownPreview content={markdown} />
            ) : (
              <Editor
                height="100%"
                language="markdown"
                theme="vs-dark"
                value={markdown}
                onChange={(value) => {
                  const content = value ?? ''
                  setMarkdown(content)
                  if (viewingTaskId) scheduleAutosave(viewingTaskId, content)
                }}
                options={{
                  wordWrap: 'on',
                  lineNumbers: 'off',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  padding: { top: 12, bottom: 12 }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end border-t border-zinc-800 px-4 py-3">
        <div ref={sendMenuRef} className="relative">
          <button
            onClick={() => { if (enabledAgents.length > 0) setSendMenuOpen((v) => !v) }}
            disabled={enabledAgents.length === 0}
            title={enabledAgents.length === 0 ? 'No agents enabled' : undefined}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors ${enabledAgents.length === 0 ? 'cursor-not-allowed bg-zinc-700 text-zinc-500' : 'bg-white text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'}`}
          >
            Send to
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-zinc-500">
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {sendMenuOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-1 w-40 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { setSendMenuOpen(false); handleSendToAgent(agent.id) }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  {agent.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete task"
          description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setConfirmingDelete(false)
            if (viewingTaskId) deleteTask(viewingTaskId)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
