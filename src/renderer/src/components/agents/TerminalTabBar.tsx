import { VscClose, VscAdd } from 'react-icons/vsc'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'

export default function TerminalTabBar(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const handleNewTerminal = async (): Promise<void> => {
    if (currentFolder) {
      try {
        await createTab(currentFolder)
      } catch (err) {
        console.error('Failed to create terminal:', err)
      }
    }
  }

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex-1 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex w-full items-center gap-1.5 px-3 py-2 text-sm ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span className="flex-1 truncate text-left">
                {tab.name}
                {tab.exited && (
                  <span className="ml-1 text-zinc-500">(exited)</span>
                )}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }
                }}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-600 group-hover:opacity-100"
              >
                <VscClose size={14} />
              </span>
            </button>
          )
        })}
      </div>
      <button
        onClick={handleNewTerminal}
        className="flex w-full items-center gap-1.5 border-t border-zinc-800 px-3 py-2 text-zinc-400 hover:text-zinc-200"
        title="New terminal"
      >
        <VscAdd size={16} />
        <span className="text-sm">New terminal</span>
      </button>
    </div>
  )
}
