import { VscClose, VscAdd } from 'react-icons/vsc'
import { Loader2 } from 'lucide-react'
import { useBrowserStore } from '@renderer/stores/browser'

export default function BrowserTabBar(): React.JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const setActiveTab = useBrowserStore((s) => s.setActiveTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const createTab = useBrowserStore((s) => s.createTab)

  const handleNewTab = async (): Promise<void> => {
    try {
      await createTab()
    } catch (err) {
      console.error('Failed to create browser tab:', err)
    }
  }

  return (
    <div className="flex h-9 items-center gap-0 overflow-x-auto border-b border-zinc-800 bg-zinc-900">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex h-full items-center gap-1.5 border-r border-zinc-800 px-3 text-sm ${
              isActive
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.isLoading && <Loader2 size={12} className="shrink-0 animate-spin text-zinc-400" />}
            <span className="max-w-[160px] truncate">{tab.title || tab.url}</span>
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
              className="ml-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-600 group-hover:opacity-100"
            >
              <VscClose size={14} />
            </span>
          </button>
        )
      })}
      <button
        onClick={handleNewTab}
        className="flex h-full items-center px-2 text-zinc-400 hover:text-zinc-200"
        title="New browser tab"
      >
        <VscAdd size={16} />
      </button>
    </div>
  )
}
