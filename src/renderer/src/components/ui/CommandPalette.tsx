import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import { useTerminalStore } from '@renderer/stores/terminal'

interface CommandItem {
  id: string
  label: string
  description: string
  action: () => void
  category: 'navigation' | 'project' | 'terminal' | 'task'
}

export default function CommandPalette(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { showOrchestrate, showTerminal, showPage, currentFolder } = useAppStore()
  const { createTask } = useTasksStore()
  const { createTab } = useTerminalStore()

  const commands: CommandItem[] = [
    {
      id: 'nav-orchestrate',
      label: 'Go to Orchestrate',
      description: 'View the global agent activity feed',
      category: 'navigation',
      action: () => { showOrchestrate(); setOpen(false) }
    },
    {
      id: 'nav-settings',
      label: 'Open Settings',
      description: 'Configure app preferences',
      category: 'navigation',
      action: () => { showPage('settings'); setOpen(false) }
    },
    {
      id: 'nav-skills',
      label: 'Open Skills',
      description: 'Manage and configure skills',
      category: 'navigation',
      action: () => { showPage('skills'); setOpen(false) }
    },
    {
      id: 'terminal-new',
      label: 'New Terminal',
      description: 'Open a new terminal tab',
      category: 'terminal',
      action: async () => {
        if (currentFolder) {
          await createTab(currentFolder)
          showTerminal()
        } else {
          showTerminal()
        }
        setOpen(false)
      }
    },
    {
      id: 'task-new',
      label: 'New Task',
      description: 'Create a new task in the current project',
      category: 'task',
      action: async () => {
        if (currentFolder) {
          await createTask('planning', 'New task')
        }
        setOpen(false)
      }
    },
  ]

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-700 px-4 py-3">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-500">No commands found</div>
          )}
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-white">{cmd.label}</span>
                <span className="text-xs text-zinc-500 truncate">{cmd.description}</span>
              </div>
              <span className="ml-auto shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                {cmd.category}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}