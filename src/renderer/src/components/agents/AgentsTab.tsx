import { useEffect } from 'react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { Button } from '@renderer/components/ui/button'
import TerminalTabBar from './TerminalTabBar'
import TerminalPane from './TerminalPane'

export default function AgentsTab(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const createTab = useTerminalStore((s) => s.createTab)
  const closeAllTabs = useTerminalStore((s) => s.closeAllTabs)
  const currentFolder = useAppStore((s) => s.currentFolder)
  // Close all terminals when project folder changes
  useEffect(() => {
    closeAllTabs()
  }, [currentFolder, closeAllTabs])

  const handleNewAgent = async (): Promise<void> => {
    if (currentFolder) {
      try {
        await createTab(currentFolder)
      } catch (err) {
        console.error('Failed to create terminal:', err)
      }
    }
  }

  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Agents</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Select a project folder to get started with agents.
        </p>
      </div>
    )
  }

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Agents</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Spawn terminal agents to run commands and automate tasks in your project.
        </p>
        <Button variant="solid" onClick={handleNewAgent} className="mt-2">
          New agent
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-row overflow-hidden">
      <TerminalTabBar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="relative flex-1">
          {tabs.map((tab) => (
            <TerminalPane key={tab.id} id={tab.id} active={tab.id === activeTabId} />
          ))}
        </div>
      </div>
    </div>
  )
}
