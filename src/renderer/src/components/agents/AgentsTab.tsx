import { useEffect } from 'react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import TerminalTabBar from './TerminalTabBar'
import TerminalPane from './TerminalPane'

export default function AgentsTab(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const closeAllTabs = useTerminalStore((s) => s.closeAllTabs)
  const currentFolder = useAppStore((s) => s.currentFolder)

  // Close all terminals when project folder changes
  useEffect(() => {
    closeAllTabs()
  }, [currentFolder, closeAllTabs])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h2 className="text-2xl font-semibold text-zinc-200">Agents</h2>
        <p className="text-zinc-500">Select a project folder to open terminals</p>
      </div>
    )
  }

  if (tabs.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <TerminalTabBar />
        <div className="flex flex-1 items-center justify-center gap-3">
          <p className="text-zinc-500">Click + to open a new terminal</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TerminalTabBar />
      <div className="relative flex-1">
        {tabs.map((tab) => (
          <TerminalPane key={tab.id} id={tab.id} active={tab.id === activeTabId} />
        ))}
      </div>
    </div>
  )
}
