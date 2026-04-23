import { FolderPlus, PanelBottom, Settings } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useAllProjectsAgentStatus } from '@renderer/hooks/useProjectAgentStatus'
import { AGENT_COLORS, ATTENTION_BG } from '@renderer/lib/agent-colors'
import { PROJECT_DETAIL_TABS } from '@renderer/lib/project-detail-tabs'

function Logo(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="21"
      viewBox="0 0 114 133"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
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

const isMac = navigator?.userAgent?.includes('Mac')

function projectName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

export default function TopBar(): React.JSX.Element {
  const contentView = useAppStore((s) => s.contentView)
  const currentFolder = useAppStore((s) => s.currentFolder)
  const projects = useAppStore((s) => s.projects)
  const addProject = useAppStore((s) => s.addProject)
  const showOrchestrate = useAppStore((s) => s.showOrchestrate)
  const showProjectDetail = useAppStore((s) => s.showProjectDetail)
  const projectDetailTab = useAppStore((s) => s.projectDetailTab)
  const setProjectDetailTab = useAppStore((s) => s.setProjectDetailTab)
  const showPage = useAppStore((s) => s.showPage)
  const bottomTerminalOpen = useAppStore((s) => s.bottomTerminalOpen)
  const toggleBottomTerminal = useAppStore((s) => s.toggleBottomTerminal)
  const agentStatusMap = useAllProjectsAgentStatus()

  const handleAddProject = async (): Promise<void> => {
    const folder = await window.orchestrate.selectFolder()
    if (folder) {
      await addProject(folder)
      await showProjectDetail(folder)
    }
  }

  const handleSelectDetailTab = (tab: (typeof PROJECT_DETAIL_TABS)[number]['id']): void => {
    if (!currentFolder) return

    if (contentView.type === 'project-detail') {
      setProjectDetailTab(tab)
      return
    }

    void showProjectDetail(currentFolder, tab)
  }

  return (
    <nav
      className={`flex h-14 items-center gap-3 bg-zinc-900 pr-4 ${isMac ? 'pl-[96px]' : 'pl-4'}`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => {
          showOrchestrate()
        }}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
          contentView.type === 'orchestrate'
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="Orchestrate"
        aria-label="Orchestrate"
      >
        <Logo />
      </button>

      <div className="min-w-0 flex-1 py-2">
        <div
          className="flex w-fit max-w-full items-center gap-2 overflow-x-auto dark-scrollbar"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {projects.map((folder) => {
            const active =
              currentFolder === folder &&
              (contentView.type === 'project-detail' || contentView.type === 'worktree-detail')
            const status = agentStatusMap.get(folder)

            return (
              <button
                key={folder}
                type="button"
                onClick={() => {
                  showProjectDetail(folder)
                }}
                title={folder}
                className={`flex h-9 min-w-36 max-w-52 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {status?.dots && status.dots.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    {status.dots.slice(0, 3).map((dot) => (
                      <span
                        key={dot.tabId}
                        className={`h-1.5 w-1.5 rounded-full ${
                          dot.status === 'attention'
                            ? `${ATTENTION_BG} ring-1 ring-amber-500/40`
                            : AGENT_COLORS[dot.colorIndex].bg
                        }`}
                      />
                    ))}
                  </span>
                )}
                <span className="truncate">{projectName(folder)}</span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={handleAddProject}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Add project"
            aria-label="Add project"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {currentFolder && (
          <>
            <div className="flex items-center gap-1">
              {PROJECT_DETAIL_TABS.map(({ id, label, icon: Icon }) => {
                const active = contentView.type === 'project-detail' && projectDetailTab === id

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectDetailTab(id)}
                    className={`rounded-md p-1.5 transition-colors ${
                      active
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                    title={label}
                    aria-label={label}
                    aria-pressed={active}
                  >
                    <Icon size={16} />
                  </button>
                )
              })}
            </div>

            <div className="mx-1 h-5 w-px bg-zinc-800" aria-hidden="true" />
          </>
        )}

        <button
          type="button"
          onClick={toggleBottomTerminal}
          className={`rounded-md p-1.5 transition-colors ${
            bottomTerminalOpen
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
          title={bottomTerminalOpen ? 'Hide terminal' : 'Show terminal'}
          aria-label={bottomTerminalOpen ? 'Hide terminal' : 'Show terminal'}
        >
          <PanelBottom size={16} />
        </button>
        <button
          type="button"
          onClick={() => showPage('settings')}
          className={`rounded-md p-1.5 transition-colors ${
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
