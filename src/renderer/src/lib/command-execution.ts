import { useCommandsStore } from '@renderer/stores/commands'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'

export async function executeSavedCommand(commandId: string, folder: string): Promise<void> {
  const command = useCommandsStore.getState().commands.find((c) => c.id === commandId)
  if (!command) return

  const termStore = useTerminalStore.getState()
  const groupId = termStore.findOrCreateGroup(command.name, folder)

  let firstTabId: string | null = null
  for (const entry of command.commands) {
    const tabName = entry.label || entry.command
    const tabId = await termStore.createTabInGroup(folder, groupId, tabName, entry.command)
    if (!firstTabId) firstTabId = tabId
  }

  if (firstTabId) {
    termStore.setActiveTab(firstTabId)
  }
  await useAppStore.getState().showTerminal(folder)
}
