import { useState, useCallback, useEffect } from 'react'
import { X, Plus, Terminal } from 'lucide-react'
import { useTerminalStore, type TerminalSession } from '@renderer/stores/terminal'

interface TerminalTabsProps {
  sessions: TerminalSession[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TerminalTabs({ sessions, activeSessionId, onSelect, onClose, onNew }: TerminalTabsProps) {
  return (
    <div className="flex items-center border-b border-border bg-background px-2">
      <div className="flex flex-1 items-center overflow-x-auto">
        {sessions.map(session => (
          <div
            key={session.id}
            className={`group flex items-center gap-2 border-r border-border px-3 py-2 text-sm cursor-pointer ${
              session.id === activeSessionId ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
            onClick={() => onSelect(session.id)}
          >
            <Terminal className="h-3 w-3 text-muted-foreground" />
            <span className="max-w-32 truncate">{session.title || 'Terminal'}</span>
            <button
              className="hidden rounded p-0.5 hover:bg-destructive/20 group-hover:flex"
              onClick={e => {
                e.stopPropagation()
                onClose(session.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent"
        onClick={onNew}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}