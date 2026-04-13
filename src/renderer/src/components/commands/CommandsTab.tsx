import { useEffect } from 'react'
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

  useEffect(() => {
    setEditingCommand(null)
    if (currentFolder) {
      loadCommands(currentFolder)
    } else {
      resetCommands()
    }
  }, [currentFolder, loadCommands, resetCommands, setEditingCommand])

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
        <CommandDetailPanel />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Commands</h2>
        <Button variant="solid" size="sm" onClick={() => setEditingCommand({})}>
          New command
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {commands.map((cmd) => (
            <CommandCard
              key={cmd.id}
              command={cmd}
              onSelect={(c) => setEditingCommand(c)}
              onDelete={(id, scope) => deleteCommand(id, scope)}
              isSelected={editingCommand?.id === cmd.id}
            />
          ))}
        </div>
      </div>

      <CommandDetailPanel />
    </div>
  )
}
