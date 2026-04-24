import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Command, X, ArrowUp, ArrowDown, Enter } from 'lucide-react'
import { useTasks } from '@/stores/tasks'
import { useCommands } from '@/stores/commands'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { tasks, setSelectedTaskId } = useTasks()
  const { commands } = useCommands()

  // Combine tasks and commands for search
  const items = [
    ...tasks.map(t => ({ type: 'task' as const, id: t.id, title: t.title, status: t.status })),
    ...commands.map(c => ({ type: 'command' as const, id: c.id, title: c.name }))
  ].filter(item => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10)

  const handleSelect = useCallback((item: typeof items[0]) => {
    if (item.type === 'task') {
      setSelectedTaskId(item.id)
    }
    onOpenChange(false)
    setQuery('')
  }, [setSelectedTaskId, onOpenChange])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      setSelectedIndex(0)
      setQuery('')
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks or commands..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={() => onOpenChange(false)} className="rounded p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        {items.length > 0 && (
          <ul className="max-h-72 overflow-y-auto p-1">
            {items.map((item, index) => (
              <li
                key={`${item.type}-${item.id}`}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 ${index === selectedIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.type === 'task' ? <Command className="h-4 w-4" /> : <span className="text-xs">⌘</span>}
                <span className="flex-1 truncate text-sm">{item.title}</span>
                {item.type === 'task' && (
                  <span className="text-xs text-muted-foreground">{item.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {query && items.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">No results found</div>
        )}
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span><ArrowUp className="inline h-3 w-3" /> <ArrowDown className="inline h-3 w-3" /> navigate</span>
          <span><Enter className="inline h-3 w-3" /> select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  )
}
