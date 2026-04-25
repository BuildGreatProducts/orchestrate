import { useEffect, useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useCommandsStore } from '@renderer/stores/commands'
import { useAppStore } from '@renderer/stores/app'
import { Button } from '@renderer/components/ui/button'
import CommandCard from './CommandCard'
import CommandDetailPanel from './CommandDetailPanel'

export default function CommandsTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const commands = useCommandsStore((s) => s.commands)
  const hasLoaded = useCommandsStore((s) => s.hasLoaded)
  const loadCommands = useCommandsStore((s) => s.loadCommands)
  const editingCommand = useCommandsStore((s) => s.editingCommand)
  const setEditingCommand = useCommandsStore((s) => s.setEditingCommand)
  const deleteCommand = useCommandsStore((s) => s.deleteCommand)
  const resetCommands = useCommandsStore((s) => s.resetCommands)

  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setEditingCommand(null)
    resetCommands()
    if (currentFolder) {
      loadCommands(currentFolder)
    }
  }, [currentFolder, loadCommands, resetCommands, setEditingCommand])

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return commands
    const query = searchQuery.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.commands.some((entry) =>
          entry.command.toLowerCase().includes(query) ||
          entry.label?.toLowerCase().includes(query)
        )
    )
  }, [commands, searchQuery])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Commands</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Select a project folder to get started with saved commands.
        </p>
      </div>
    )
  }

  if (hasLoaded && commands.length === 0) {
    return (
      <div className="relative flex flex-1 overflow-hidden">
        {!editingCommand && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
            <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Commands</h2>
            <p className="max-w-xs text-sm text-zinc-500">
              Save groups of terminal commands to launch them together with one click.
            </p>
            <Button variant="solid" onClick={() => setEditingCommand({})} className="mt-2">
              New command
            </Button>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center border-b border-zinc-800 px-6 py-3">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>
        <CommandDetailPanel />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Commands</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <Button variant="solid" size="sm" onClick={() => setEditingCommand({})}>
            New command
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCommands.map((cmd) => (
            <CommandCard
              key={cmd.id}
              command={cmd}
              onSelect={(c) => setEditingCommand(c)}
              onDelete={(id, scope) => deleteCommand(id, scope)}
              isSelected={editingCommand?.id === cmd.id}
            />
          ))}
        </div>
        {filteredCommands.length === 0 && searchQuery && (
          <p className="mt-4 text-center text-sm text-zinc-500">
            No commands match "{searchQuery}"
          </p>
        )}
      </div>

      <CommandDetailPanel />
    </div>
  )
}
