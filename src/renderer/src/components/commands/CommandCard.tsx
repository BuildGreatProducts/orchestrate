import { Play, Trash2, Globe, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { SavedCommand } from '@shared/types'
import { useAppStore } from '@renderer/stores/app'
import { executeSavedCommand } from '@renderer/lib/command-execution'

interface CommandCardProps {
  command: SavedCommand
  onSelect: (command: SavedCommand) => void
  onDelete: (id: string, scope: 'project' | 'global') => void
  isSelected?: boolean
}

export default function CommandCard({ command, onSelect, onDelete, isSelected }: CommandCardProps): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const handleRun = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (currentFolder) {
      executeSavedCommand(command.id, currentFolder)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(command)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(command)
      }}
      className={`flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors ${
        isSelected
          ? 'border-zinc-500 bg-zinc-800'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{command.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {command.scope === 'global' ? <Globe size={10} /> : <FolderOpen size={10} />}
            {command.scope === 'global' ? 'Global' : 'Project'}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {command.commands.length} cmd{command.commands.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {command.commands.map((entry, i) => (
          <span key={i} className="truncate rounded bg-zinc-800/60 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">
            {entry.label || entry.command}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1 border-t border-zinc-800 pt-3">
        <button
          onClick={handleRun}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-400 hover:bg-zinc-800"
        >
          <Play size={12} />
          Run
        </button>
        {confirmDelete ? (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">Delete?</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(command.id, command.scope) }}
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
            aria-label={`Delete ${command.name}`}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
