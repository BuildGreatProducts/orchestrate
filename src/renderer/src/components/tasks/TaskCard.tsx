import { useState, useRef, useEffect, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Play, Square, Repeat, Eye, Clock } from 'lucide-react'
import { CronExpressionParser } from 'cron-parser'
import type { TaskMeta } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'
import { useLoopsStore } from '@renderer/stores/loops'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { executeLoop, isLoopRunning, abortLoop } from '@renderer/stores/loop-execution-engine'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'

/** Derive a short frequency label from a cron expression. */
function cronFrequency(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron

  const [min, hour, dom, , dow] = parts

  // Every minute
  if (min === '*' && hour === '*') return 'Every min'
  // Every N minutes
  if (min?.startsWith('*/') && hour === '*') return `Every ${min.slice(2)}m`
  // Every hour (at fixed minute)
  if (min !== '*' && hour === '*') return 'Hourly'
  // Every N hours
  if (hour?.startsWith('*/')) return `Every ${hour.slice(2)}h`
  // Daily
  if (min !== '*' && hour !== '*' && dom === '*' && dow === '*') return 'Daily'
  // Weekdays
  if (min !== '*' && hour !== '*' && dom === '*' && dow === '1-5') return 'Weekdays'

  return cron
}

/** Get next run time formatted as short relative + clock, e.g. "Today 14:25" or "Tomorrow 09:00". */
function nextRunLabel(cron: string): string | null {
  try {
    const next = CronExpressionParser.parse(cron).next().toDate()
    const now = new Date()
    const time = next.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

    const diffMs = next.getTime() - now.getTime()
    if (diffMs < 0) return null

    // Same calendar day
    if (next.toDateString() === now.toDateString()) return `today ${time}`

    // Tomorrow
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (next.toDateString() === tomorrow.toDateString()) return `tmrw ${time}`

    // Within 7 days — show day name
    if (diffMs < 7 * 24 * 60 * 60 * 1000) {
      const day = next.toLocaleDateString('en-US', { weekday: 'short' })
      return `${day} ${time}`
    }

    // Further out
    const date = next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${date} ${time}`
  } catch {
    return null
  }
}

interface TaskCardProps {
  id: string
  task: TaskMeta
  isDragOverlay?: boolean
}

export default function TaskCard({ id, task, isDragOverlay }: TaskCardProps): React.JSX.Element {
  const selectTask = useTasksStore((s) => s.selectTask)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const updateTaskTitle = useTasksStore((s) => s.updateTaskTitle)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const renamingTaskId = useTasksStore((s) => s.renamingTaskId)
  const setRenamingTaskId = useTasksStore((s) => s.setRenamingTaskId)
  const readMarkdown = useTasksStore((s) => s.readMarkdown)
  const markdownRevision = useTasksStore((s) => s.markdownRevision)
  const activeAgentTasks = useTasksStore((s) => s.activeAgentTasks)

  const agentInfo = activeAgentTasks[id]
  const isLoop = task.type === 'loop'
  const agentRunning = !!agentInfo && !isLoop

  // Loop-specific state
  const loops = useLoopsStore((s) => s.loops)
  const loop = task.type === 'loop' && task.loopId
    ? loops.find((l) => l.id === task.loopId) ?? null
    : null

  // Terminal group for loop cards — used for "View Agent" navigation
  const terminalGroups = useTerminalStore((s) => s.groups)
  const loopGroup = loop?.lastRun?.groupId
    ? terminalGroups.find((g) => g.id === loop.lastRun!.groupId) ?? null
    : null
  const loopHasAgent = !!loopGroup && loopGroup.tabIds.length > 0

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(task.title)
  const renameCancelledRef = useRef(false)
  const [preview, setPreview] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const isSelected = selectedTaskId === id

  const createdDate = new Date(task.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })

  // Load preview text from markdown (only for regular tasks)
  useEffect(() => {
    if (isLoop) return
    let cancelled = false
    readMarkdown(id).then((content) => {
      if (cancelled) return
      const line = content
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#'))
      setPreview(line ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [id, readMarkdown, markdownRevision, isLoop])

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

  // Auto-enter rename mode for newly created tasks
  useEffect(() => {
    if (renamingTaskId === id) {
      setRenameValue(task.title)
      setIsRenaming(true)
      setRenamingTaskId(null)
    }
  }, [renamingTaskId, id, task.title, setRenamingTaskId])

  // Focus and select input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming])

  const handleRename = useCallback(() => {
    setMenuOpen(false)
    setRenameValue(task.title)
    setIsRenaming(true)
  }, [task.title])

  const commitRename = useCallback(() => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      return
    }
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTaskTitle(id, trimmed)
    }
    setIsRenaming(false)
  }, [id, renameValue, task.title, updateTaskTitle])

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    setConfirmingDelete(true)
  }, [])

  const handleRunLoop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (task.loopId) executeLoop(task.loopId)
  }, [task.loopId])

  const handleStopLoop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (task.loopId) abortLoop(task.loopId)
  }, [task.loopId])

  const handleViewAgent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (agentInfo) {
      useTerminalStore.getState().setActiveTab(agentInfo.terminalId)
    }
    useAppStore.getState().setActiveTab('agents')
  }, [agentInfo])

  const handleViewLoopAgent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (loopGroup && loopGroup.tabIds.length > 0) {
      // Activate the most recent terminal in the group
      useTerminalStore.getState().setActiveTab(loopGroup.tabIds[loopGroup.tabIds.length - 1])
    }
    useAppStore.getState().setActiveTab('agents')
  }, [loopGroup])

  const running = loop && (isLoopRunning(loop.id) || loop.lastRun?.status === 'running')

  // Status dot color for loop cards
  const statusColor = loop
    ? loop.lastRun?.status === 'running'
      ? 'bg-yellow-400 animate-pulse'
      : loop.lastRun?.status === 'completed'
        ? 'bg-green-400'
        : loop.lastRun?.status === 'failed'
          ? 'bg-red-400'
          : 'bg-zinc-500'
    : ''

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
      onClick={() => !isRenaming && selectTask(id)}
      className={`group relative cursor-grab rounded-lg border p-3 transition-colors active:cursor-grabbing ${
        isSelected
          ? 'border-zinc-500 bg-zinc-800'
          : 'border-zinc-700 bg-zinc-800/80 hover:border-zinc-600'
      }`}
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        {isLoop && (
          <div className="flex items-center gap-1.5">
            <Repeat size={12} className="shrink-0 text-blue-400" />
            <div className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
          </div>
        )}
        {agentRunning && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 shrink-0 rounded-full bg-yellow-400 animate-pulse" />
          </div>
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                renameCancelledRef.current = true
                setRenameValue(task.title)
                setIsRenaming(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-sm text-zinc-200 outline-none focus:border-zinc-400"
          />
        ) : (
          <p className="line-clamp-2 pr-6 text-sm text-zinc-200">{task.title}</p>
        )}
      </div>

      {/* Loop-specific info */}
      {isLoop && loop && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {loop.steps.length} step{loop.steps.length !== 1 ? 's' : ''}
          </span>
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {loop.agentType === 'claude-code' ? 'Claude' : 'Codex'}
          </span>
          {/* Inline Run/Stop button */}
          {running ? (
            <button
              onClick={handleStopLoop}
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-zinc-700"
            >
              <Square size={10} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRunLoop}
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-green-400 hover:bg-zinc-700"
            >
              <Play size={10} />
              Run
            </button>
          )}
        </div>
      )}

      {/* Agent running badge */}
      {agentRunning && (
        <div className="mt-1.5">
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {agentInfo.agent === 'claude-code' ? 'Claude' : 'Codex'}
          </span>
        </div>
      )}

      {/* Schedule info for regular tasks */}
      {!isLoop && task.schedule?.enabled && task.schedule.cron && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <Clock size={10} className="shrink-0" />
          <span>{cronFrequency(task.schedule.cron)}</span>
          {(() => {
            const next = nextRunLabel(task.schedule!.cron)
            return next ? (
              <>
                <span className="text-zinc-600">&middot;</span>
                <span className="text-zinc-400">{next}</span>
              </>
            ) : null
          })()}
        </div>
      )}

      {/* Regular task preview */}
      {!isLoop && preview && <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{preview}</p>}
      <p className="mt-1 text-xs text-zinc-600">{createdDate}</p>

      {/* View agent button */}
      {(agentRunning || loopHasAgent) && (
        <button
          onClick={agentRunning ? handleViewAgent : handleViewLoopAgent}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700"
        >
          <Eye size={10} />
          View Agent
        </button>
      )}

      {/* 3-dot menu */}
      {!isDragOverlay && !isRenaming && (
        <div ref={menuRef} className="absolute right-2 top-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-0.5 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menuOpen}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3.5" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="8" cy="12.5" r="1.25" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-32 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
              {!isLoop && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRename()
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  Rename
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete()
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={isLoop ? 'Delete loop' : 'Delete task'}
          description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setConfirmingDelete(false)
            deleteTask(id)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
