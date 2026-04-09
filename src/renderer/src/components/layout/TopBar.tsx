import { Settings, Plus, X, Folder } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useAllProjectsAgentStatus, type AgentDot } from '@renderer/hooks/useProjectAgentStatus'
import { AGENT_COLORS, ATTENTION_BG } from '@renderer/lib/agent-colors'

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

function ProjectIcon({ dots }: { dots?: AgentDot[] }): React.JSX.Element {
  // Pick the highest-priority dot: attention first, then active
  const dot = dots?.[0]
  if (!dot) {
    return <Folder size={13} className="shrink-0 opacity-50" />
  }
  return (
    <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center">
      <span
        className={`h-2 w-2 rounded-full animate-pulse ${
          dot.status === 'attention'
            ? `${ATTENTION_BG} ring-2 ring-amber-500/40`
            : AGENT_COLORS[dot.colorIndex].bg
        }`}
      />
    </span>
  )
}

const isMac = navigator?.userAgent?.includes('Mac')

export default function TopBar(): React.JSX.Element {
  const { currentFolder, setCurrentFolder, projects, addProject, removeProject, contentView, showPage } =
    useAppStore()
  const agentStatusMap = useAllProjectsAgentStatus()

  const handleAddProject = async (): Promise<void> => {
    const folder = await window.orchestrate.selectFolder()
    if (folder) {
      await addProject(folder)
      setCurrentFolder(folder)
    }
  }

  const handleRemove = async (e: React.MouseEvent, path: string): Promise<void> => {
    e.stopPropagation()
    await removeProject(path)
  }

  return (
    <nav
      className={`flex h-12 items-center border-b border-zinc-800 bg-zinc-900 pr-4 ${isMac ? 'pl-[96px]' : 'pl-4'}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Logo />
      </div>

      <div className="mx-2 h-5 w-px bg-zinc-800" />

      {/* Project tabs — container inherits drag from nav, only tabs are no-drag */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide">
        {projects.map((path) => {
          const name = path.split(/[/\\]/).pop()
          const isActive = path === currentFolder
          const status = agentStatusMap.get(path)
          return (
            <div
              key={path}
              className={`group flex shrink-0 items-center gap-1.5 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              } ${status?.hasAttention ? 'ring-1 ring-amber-500/30' : ''}`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={() => setCurrentFolder(path)}
                className="flex items-center gap-1.5 py-1.5 pl-3 pr-1"
                title={path}
              >
                <ProjectIcon dots={status?.dots} />
                <span className="max-w-[160px] truncate">{name}</span>
              </button>
              <button
                onClick={(e) => handleRemove(e, path)}
                aria-label={`Close ${name}`}
                className={`shrink-0 rounded p-0.5 pr-1.5 transition-opacity hover:bg-zinc-600 ${
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <X size={12} className="text-zinc-400" />
              </button>
            </div>
          )
        })}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={handleAddProject}
            className="shrink-0 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Add project"
            aria-label="Add project"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="ml-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => showPage('settings')}
          className={`rounded p-1.5 transition-colors ${
            contentView.type === 'page' && contentView.pageId === 'settings'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </nav>
  )
}
