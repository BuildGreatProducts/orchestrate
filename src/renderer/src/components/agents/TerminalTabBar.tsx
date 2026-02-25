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

  const handleNewTerminal = (): void => {
    if (currentFolder) {
      createTab(currentFolder)
    }
  }

  return (
    <div className="flex h-9 items-center gap-0 overflow-x-auto border-b border-zinc-700 bg-zinc-900">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex h-full items-center gap-1.5 border-r border-zinc-700 px-3 text-sm ${
              isActive
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span className="max-w-[160px] truncate">
              {tab.name}
              {tab.exited && (
                <span className="ml-1 text-zinc-500">(exited)</span>
              )}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="ml-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-600 group-hover:opacity-100"
            >
              <VscClose size={14} />
            </span>
          </button>
        )
      })}
      <button
        onClick={handleNewTerminal}
        className="flex h-full items-center px-2 text-zinc-400 hover:text-zinc-200"
        title="New terminal"
      >
        <VscAdd size={16} />
      </button>
    </div>
  )
}
