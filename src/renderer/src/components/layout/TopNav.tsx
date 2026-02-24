import { useAppStore } from '@renderer/stores/app'
import { TAB_LIST } from '@shared/types'
import FolderSelector from './FolderSelector'

export default function TopNav(): React.JSX.Element {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <nav className="flex h-12 items-center border-b border-zinc-700 bg-zinc-900 px-4">
      <FolderSelector />

      <div className="mx-2 h-5 w-px bg-zinc-700" />

      <div className="flex gap-1">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
