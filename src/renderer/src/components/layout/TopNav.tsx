import { MessageSquare, Terminal, LayoutList, FolderOpen, History } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { TAB_LIST } from '@shared/types'
import type { TabId } from '@shared/types'
import FolderSelector from './FolderSelector'

const TAB_ICONS: Record<TabId, React.ComponentType<{ size?: number }>> = {
  orchestrate: MessageSquare,
  agents: Terminal,
  tasks: LayoutList,
  files: FolderOpen,
  history: History
}

function Logo(): React.JSX.Element {
  return (
    <svg width="18" height="21" viewBox="0 0 114 133" fill="none" aria-hidden="true" focusable="false" className="shrink-0">
      <path
        d="M48.8492 73.9895L6.98324 116.601C1.32928 122.356 5.41345 132.065 13.4881 132.065H97.22C105.295 132.065 109.379 122.356 103.725 116.601L61.8589 73.9895C58.287 70.3539 52.4211 70.3539 48.8492 73.9895Z"
        fill="white"
      />
      <path
        d="M56.6616 0C28.1131 0 4.44277 20.8992 0.0968301 48.2421C-0.692811 53.2102 3.45857 57.3153 8.48586 57.3153H104.837C109.865 57.3153 114.016 53.2102 113.226 48.2421C108.88 20.8992 85.21 0 56.6616 0Z"
        fill="white"
      />
    </svg>
  )
}

export default function TopNav(): React.JSX.Element {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <nav className="flex h-12 items-center border-b border-zinc-700 bg-zinc-900 px-4">
      <Logo />

      <div className="mx-2 h-5 w-px bg-zinc-700" />

      <FolderSelector />

      <div className="mx-2 h-5 w-px bg-zinc-700" />

      <div className="flex gap-1">
        {TAB_LIST.map((tab) => {
          const Icon = TAB_ICONS[tab.id]
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
