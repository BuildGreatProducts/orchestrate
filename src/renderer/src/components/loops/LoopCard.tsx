import { Play, Trash2, Square } from 'lucide-react'
import { useState } from 'react'
import type { Loop } from '@shared/types'
import { isLoopRunning, abortLoop, executeLoop } from '@renderer/stores/loop-execution-engine'

interface LoopCardProps {
  loop: Loop
  onSelect: (loop: Loop) => void
  onDelete: (id: string) => void
  isSelected?: boolean
}

function humanCron(cron: string): string {
  if (!cron) return 'Manual'
  if (cron === '0 * * * *') return 'Every hour'
  if (cron === '0 9 * * *') return 'Daily at 9am'
  if (cron === '0 9 * * 1-5') return 'Weekdays at 9am'
  return cron
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function LoopCard({ loop, onSelect, onDelete, isSelected }: LoopCardProps): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const running = isLoopRunning(loop.id) || loop.lastRun?.status === 'running'

  const statusColor =
    loop.lastRun?.status === 'running'
      ? 'bg-yellow-400 animate-pulse'
      : loop.lastRun?.status === 'completed'
        ? 'bg-green-400'
        : loop.lastRun?.status === 'failed'
          ? 'bg-red-400'
          : 'bg-zinc-500'

  return (
    <div
      onClick={() => onSelect(loop)}
      className={`flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors ${
        isSelected
          ? 'border-zinc-500 bg-zinc-800'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
          <h3 className="truncate text-sm font-semibold text-zinc-100">{loop.name}</h3>
        </div>
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
          {loop.steps.length} step{loop.steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
        <span className="rounded bg-zinc-800/60 px-1.5 py-0.5">
          {loop.agentType === 'claude-code' ? 'Claude Code' : 'Codex'}
        </span>
        <span className="rounded bg-zinc-800/60 px-1.5 py-0.5">
          {loop.schedule.enabled ? humanCron(loop.schedule.cron) : 'Manual'}
        </span>
      </div>

      {loop.lastRun && (
        <p className="text-[11px] text-zinc-500">
          Last run: {relativeTime(loop.lastRun.startedAt)} — {loop.lastRun.status}
        </p>
      )}

      <div className="flex items-center gap-1 border-t border-zinc-800 pt-3">
        {running ? (
          <button
            onClick={(e) => { e.stopPropagation(); abortLoop(loop.id) }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-800"
          >
            <Square size={12} />
            Stop
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); executeLoop(loop.id) }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-400 hover:bg-zinc-800"
          >
            <Play size={12} />
            Run
          </button>
        )}
        {confirmDelete ? (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">Delete?</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(loop.id) }}
              className="rounded px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-zinc-800"
            >
              Yes
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
            aria-label={`Delete ${loop.name}`}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
