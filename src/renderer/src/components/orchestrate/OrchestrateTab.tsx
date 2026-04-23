import { useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { AGENT_TERMINAL_SURFACE_WIDTH } from '@renderer/lib/layout-constants'
import FeedItem from './FeedItem'

export default function OrchestrateTab(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const projects = useAppStore((s) => s.projects)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)

  const bellTabs = useMemo(
    () =>
      tabs
        .filter((t) => t.bell && !t.exited && t.isAgent)
        .sort((a, b) => (b.bellAt ?? 0) - (a.bellAt ?? 0)),
    [tabs]
  )

  if (bellTabs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm text-zinc-500">
            Agent activity across all your projects will appear here when they need your attention.
          </p>
          {projects.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {projects.map((path) => {
                const name = path.split(/[/\\]/).pop() ?? path
                return (
                  <button
                    key={path}
                    onClick={() => setCurrentFolder(path)}
                    className="flex items-center gap-2 rounded-md px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <FolderOpen size={14} />
                    {name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto dark-scrollbar">
        <div
          className="mx-auto flex w-full flex-col gap-4 p-4"
          style={{ maxWidth: AGENT_TERMINAL_SURFACE_WIDTH }}
        >
          <div className="pt-8 pb-4 text-center">
            <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
            <p className="mt-3 text-sm text-zinc-500">
              Review the following agent activity
            </p>
          </div>
          {bellTabs.map((tab) => {
            const projectName = tab.projectFolder.split(/[/\\]/).pop() ?? tab.projectFolder
            return <FeedItem key={tab.id} tab={tab} projectName={projectName} />
          })}
        </div>
      </div>
    </div>
  )
}
