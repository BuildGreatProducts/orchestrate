import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import type { ColumnId } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'draft', label: 'Draft' },
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

  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [isDirty, setIsDirty] = useState(false)

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

  // Load task data when selection changes
  useEffect(() => {
    if (!selectedTaskId || !task) return
    let cancelled = false
    setTitle(task.title)
    setIsDirty(false)
    readMarkdown(selectedTaskId).then((content) => {
      if (!cancelled) {
        setMarkdown(content)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedTaskId, task, readMarkdown])

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

  const handleSave = useCallback(async () => {
    if (!selectedTaskId) return
    await writeMarkdown(selectedTaskId, markdown)
    setIsDirty(false)
  }, [selectedTaskId, markdown, writeMarkdown])

  const handleDelete = useCallback(async () => {
    if (!selectedTaskId) return
    await deleteTask(selectedTaskId)
  }, [selectedTaskId, deleteTask])

  const handleSendToAgent = useCallback(
    async (agent: 'claude-code' | 'codex') => {
      if (!selectedTaskId) return
      // Save markdown first
      await writeMarkdown(selectedTaskId, markdown)
      setIsDirty(false)
      await sendToAgent(selectedTaskId, agent)
    },
    [selectedTaskId, markdown, writeMarkdown, sendToAgent]
  )

  if (!selectedTaskId || !task) return null

  return (
    <div className="flex w-[480px] flex-shrink-0 flex-col border-l border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Task Detail
        </span>
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

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
        />

        {/* Column selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Column</label>
          <select
            value={currentColumn ?? ''}
            onChange={handleColumnChange}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-indigo-500"
          >
            {COLUMNS.map((col) => (
              <option key={col.id} value={col.id}>
                {col.label}
              </option>
            ))}
          </select>
        </div>

        {/* Markdown editor */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-500">Description (Markdown)</label>
            {isDirty && <span className="text-xs text-amber-500">Unsaved</span>}
          </div>
          <div className="flex-1 overflow-hidden rounded border border-zinc-700">
            <Editor
              height="100%"
              language="markdown"
              theme="vs-dark"
              value={markdown}
              onChange={(value) => {
                setMarkdown(value ?? '')
                setIsDirty(true)
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
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-600 disabled:opacity-40 disabled:hover:bg-zinc-700"
        >
          Save
        </button>

        {/* Send to agent */}
        <div className="flex gap-2">
          <button
            onClick={() => handleSendToAgent('claude-code')}
            className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Claude Code
          </button>
          <button
            onClick={() => handleSendToAgent('codex')}
            className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Codex
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="rounded border border-red-900/50 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-900/20"
        >
          Delete Task
        </button>
      </div>
    </div>
  )
}
