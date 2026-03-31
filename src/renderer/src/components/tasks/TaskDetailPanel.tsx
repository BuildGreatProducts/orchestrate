import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { ColumnId, AgentType } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'
import { useTerminalStore } from '@renderer/stores/terminal'
import MarkdownToggle from '@renderer/components/files/MarkdownToggle'
import MarkdownPreview from '@renderer/components/files/MarkdownPreview'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'

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

export default function TaskDetailPanel(): React.JSX.Element | null {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const board = useTasksStore((s) => s.board)
  const selectTask = useTasksStore((s) => s.selectTask)
  const updateTaskTitle = useTasksStore((s) => s.updateTaskTitle)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const moveTask = useTasksStore((s) => s.moveTask)
  const readMarkdown = useTasksStore((s) => s.readMarkdown)
  const writeMarkdown = useTasksStore((s) => s.writeMarkdown)
  const sendToAgent = useTasksStore((s) => s.sendToAgent)
  const updateTaskSchedule = useTasksStore((s) => s.updateTaskSchedule)
  const updateTaskGroup = useTasksStore((s) => s.updateTaskGroup)
  const terminalGroups = useTerminalStore((s) => s.groups)

  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [viewMode, setViewMode] = useState<'raw' | 'pretty'>('raw')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const [scheduleAgent, setScheduleAgent] = useState<AgentType>('claude-code')
  const [scheduleCron, setScheduleCron] = useState('')
  const [schedulePreset, setSchedulePreset] = useState('')
  const [groupSelect, setGroupSelect] = useState('') // '' = none, '__new__' = new, or group name
  const [newGroupName, setNewGroupName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const sendMenuRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestMarkdownRef = useRef(markdown)
  latestMarkdownRef.current = markdown

  const task = selectedTaskId && board ? board.tasks[selectedTaskId] : null

  // Find current column
  let currentColumn: ColumnId | null = null
  if (selectedTaskId && board) {
    for (const col of COLUMNS) {
      if (board.columns[col.id].includes(selectedTaskId)) {
        currentColumn = col.id
        break
      }
    }
  }

  const isLoopTask = task?.type === 'loop'

  // Load task data when selection changes
  useEffect(() => {
    if (!selectedTaskId || !task) return
    let cancelled = false
    setTitle(task.title)
    setSaveStatus('idle')

    // Sync group state
    const gn = task.groupName ?? ''
    setNewGroupName('')
    if (!gn) {
      setGroupSelect('')
    } else {
      setGroupSelect(gn)
    }

    // Sync schedule state
    setScheduleAgent(task.agentType ?? 'claude-code')
    const cron = task.schedule?.cron ?? ''
    setScheduleCron(cron)
    if (!task.schedule?.enabled || !cron) {
      setSchedulePreset('')
    } else {
      const match = SCHEDULE_PRESETS.find((p) => p.cron === cron)
      setSchedulePreset(match ? match.cron : '__custom__')
    }

    readMarkdown(selectedTaskId).then((content) => {
      if (!cancelled) {
        setMarkdown(content)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedTaskId, task, readMarkdown])

  // Flush pending save on unmount or task switch
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
    }
  }, [selectedTaskId])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close send menu on outside click
  useEffect(() => {
    if (!sendMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setSendMenuOpen(false)
      }
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
        if (latestMarkdownRef.current === content) {
          setSaveStatus('saved')
        }
      }, 500)
    },
    [writeMarkdown]
  )

  const handleTitleBlur = useCallback(() => {
    if (selectedTaskId && title !== task?.title) {
      updateTaskTitle(selectedTaskId, title)
    }
  }, [selectedTaskId, title, task?.title, updateTaskTitle])

  const handleColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!selectedTaskId) return
      const newCol = e.target.value as ColumnId
      if (newCol !== currentColumn) {
        moveTask(selectedTaskId, newCol, 0)
      }
    },
    [selectedTaskId, currentColumn, moveTask]
  )

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    setConfirmingDelete(true)
  }, [])

  const handleSendToAgent = useCallback(
    async (agent: 'claude-code' | 'codex') => {
      if (!selectedTaskId) return
      clearTimeout(saveTimerRef.current)
      await writeMarkdown(selectedTaskId, markdown)
      setSaveStatus('saved')
      await sendToAgent(selectedTaskId, agent)
    },
    [selectedTaskId, markdown, writeMarkdown, sendToAgent]
  )

  const handleSchedulePresetChange = useCallback(
    (value: string) => {
      if (!selectedTaskId) return
      setSchedulePreset(value)
      if (value === '' || value === '__custom__') {
        const enabled = false
        const cron = value === '__custom__' ? scheduleCron : ''
        if (value === '') setScheduleCron('')
        updateTaskSchedule(
          selectedTaskId,
          { enabled, cron },
          scheduleAgent
        )
      } else {
        setScheduleCron(value)
        updateTaskSchedule(
          selectedTaskId,
          { enabled: true, cron: value },
          scheduleAgent
        )
      }
    },
    [selectedTaskId, scheduleCron, scheduleAgent, updateTaskSchedule]
  )

  const handleCustomCronChange = useCallback(
    (value: string) => {
      if (!selectedTaskId) return
      setScheduleCron(value)
      const enabled = value.trim().length > 0
      updateTaskSchedule(
        selectedTaskId,
        { enabled, cron: value.trim() },
        scheduleAgent
      )
    },
    [selectedTaskId, scheduleAgent, updateTaskSchedule]
  )

  const handleScheduleAgentChange = useCallback(
    (agent: AgentType) => {
      if (!selectedTaskId) return
      setScheduleAgent(agent)
      const enabled = schedulePreset !== '' && schedulePreset !== '__custom__'
        ? true
        : schedulePreset === '__custom__' && scheduleCron.trim().length > 0
      updateTaskSchedule(
        selectedTaskId,
        { enabled, cron: scheduleCron },
        agent
      )
    },
    [selectedTaskId, schedulePreset, scheduleCron, updateTaskSchedule]
  )

  const handleGroupSelectChange = useCallback(
    (value: string) => {
      if (!selectedTaskId) return
      setGroupSelect(value)
      if (value === '' || value === '__new__') {
        if (value === '') {
          updateTaskGroup(selectedTaskId, undefined)
        }
        // For __new__, wait until the name is committed
      } else {
        updateTaskGroup(selectedTaskId, value)
      }
    },
    [selectedTaskId, updateTaskGroup]
  )

  const handleNewGroupCommit = useCallback(
    (name: string) => {
      if (!selectedTaskId) return
      const trimmed = name.trim()
      if (trimmed) {
        setGroupSelect(trimmed)
        updateTaskGroup(selectedTaskId, trimmed)
      } else {
        setGroupSelect('')
        updateTaskGroup(selectedTaskId, undefined)
      }
    },
    [selectedTaskId, updateTaskGroup]
  )

  if (!selectedTaskId || !task) return null

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-1/2 max-w-[700px] flex-col border-l border-zinc-800 bg-zinc-900 shadow-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 bg-transparent font-ovo text-xl text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder="Task name"
        />
        <div className="mt-1 flex flex-shrink-0 items-center gap-1">
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
                  onClick={() => {
                    setMenuOpen(false)
                    handleDelete()
                  }}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => selectTask(null)}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Column selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Column</label>
          <select
            value={currentColumn ?? ''}
            onChange={handleColumnChange}
            className="rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
          >
            {COLUMNS.map((col) => (
              <option key={col.id} value={col.id}>
                {col.label}
              </option>
            ))}
          </select>
        </div>

        {/* Agent group (not for loop tasks — loops manage their own groups) */}
        {!isLoopTask && (
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
                  {savedName && !existsInGroups && (
                    <option value={savedName}>{savedName}</option>
                  )}
                  {terminalGroups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewGroupCommit(newGroupName)
                }}
                placeholder="Group name"
                autoFocus
                className="mt-1.5 w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}
          </div>
        )}

        {/* Schedule (not for loop tasks) */}
        {!isLoopTask && (
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Schedule</label>
            <select
              value={schedulePreset}
              onChange={(e) => handleSchedulePresetChange(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron} value={p.cron}>
                  {p.label}
                </option>
              ))}
            </select>
            {schedulePreset === '__custom__' && (
              <input
                type="text"
                value={scheduleCron}
                onChange={(e) => handleCustomCronChange(e.target.value)}
                placeholder="e.g. 0 9 * * 1-5"
                className="mt-1.5 w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
              />
            )}
            {schedulePreset !== '' && (
              <div className="mt-2">
                <label className="mb-1 block text-xs text-zinc-500">Agent</label>
                <div className="flex gap-2">
                  {(['claude-code', 'codex'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleScheduleAgentChange(type)}
                      className={`rounded px-3 py-1 text-xs transition-colors ${
                        scheduleAgent === type
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300'
                      }`}
                    >
                      {type === 'claude-code' ? 'Claude Code' : 'Codex'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Markdown editor */}
        <div className="relative flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-500">Description (Markdown)</label>
            {saveStatus === 'saving' && (
              <span className="text-xs text-zinc-500">Saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs text-zinc-500">Saved</span>
            )}
          </div>
          <div className="relative flex-1 overflow-hidden rounded border border-zinc-800">
            <MarkdownToggle viewMode={viewMode} onToggle={setViewMode} />
            {viewMode === 'pretty' ? (
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
                  if (selectedTaskId) {
                    scheduleAutosave(selectedTaskId, content)
                  }
                }}
                options={{
                  wordWrap: 'on',
                  lineNumbers: 'off',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  padding: { top: 8, bottom: 8 }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Send to agent */}
      <div className="flex justify-end border-t border-zinc-800 px-4 py-3">
        <div ref={sendMenuRef} className="relative">
          <button
            onClick={() => setSendMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
          >
            Send to
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-zinc-500">
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {sendMenuOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-1 w-40 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
              <button
                onClick={() => {
                  setSendMenuOpen(false)
                  handleSendToAgent('claude-code')
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                Claude Code
              </button>
              <button
                onClick={() => {
                  setSendMenuOpen(false)
                  handleSendToAgent('codex')
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                Codex
              </button>
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
            if (selectedTaskId) deleteTask(selectedTaskId)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
