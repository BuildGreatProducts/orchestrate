import { useCommandsStore } from '@renderer/stores/commands'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { toast } from '@renderer/stores/toast'
import type { SavedCommand } from '@shared/types'

export async function executeSavedCommand(commandOrId: SavedCommand | string, folder: string, worktreePath?: string): Promise<boolean> {
  let command: SavedCommand | undefined

  if (typeof commandOrId === 'string') {
    command = useCommandsStore.getState().commands.find((c) => c.id === commandOrId)
    if (!command) {
      // Store may not be loaded — fetch directly from IPC
      try {
        const all = await window.orchestrate.listCommands(folder)
        command = all.find((c) => c.id === commandOrId)
      } catch {
        // ignore fetch failure
      }
    }
  } else {
    command = commandOrId
  }

  if (!command) {
    toast.error('Command not found — it may have been deleted')
    return false
  }

  const termStore = useTerminalStore.getState()
  const groupId = termStore.findOrCreateGroup(command.name, folder)

  let firstTabId: string | null = null
  for (const entry of command.commands) {
    const tabName = entry.label || entry.command
    const tabId = await termStore.createTabInGroup(folder, groupId, tabName, entry.command, worktreePath)
    if (!firstTabId) firstTabId = tabId
  }

  if (firstTabId) {
    termStore.setActiveTab(firstTabId)
  }
  await useAppStore.getState().showTerminal(folder)
  return true
}
