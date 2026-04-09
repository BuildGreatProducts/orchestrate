import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import TerminalPane from './TerminalPane'

export default function TerminalContentArea(): React.JSX.Element {
  const allTabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const contentView = useAppStore((s) => s.contentView)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const projectTabs = allTabs.filter((t) => t.projectFolder === currentFolder)

  return (
    <div className="relative flex-1">
      {/* Empty state overlay */}
      {projectTabs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-zinc-500">No agents running in this project</p>
        </div>
      )}
      {/* Render all terminals to keep xterm instances alive */}
      {allTabs.map((tab) => (
        <TerminalPane
          key={tab.id}
          id={tab.id}
          active={tab.id === activeTabId && contentView.type === 'terminal' && tab.projectFolder === currentFolder}
        />
      ))}
    </div>
  )
}
