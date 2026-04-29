import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Terminal } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { AGENT_TERMINAL_SURFACE_WIDTH } from '@renderer/lib/layout-constants'
import { useAppModalLayer } from '@renderer/hooks/useAppModalLayer'
import AgentCard from './AgentCard'
import AgentSpawnDialog from './AgentSpawnDialog'

interface AgentColumnProps {
  projectFolder: string
}

export default function AgentColumn({ projectFolder }: AgentColumnProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const requestCloseTab = useTerminalStore((s) => s.requestCloseTab)
  const [spawnOpen, setSpawnOpen] = useState(false)
  useAppModalLayer(spawnOpen)

  const agentTabs = useMemo(
    () => tabs.filter((tab) => tab.projectFolder === projectFolder && tab.kind === 'agent'),
    [tabs, projectFolder]
  )

  return (
    <aside
      className="flex min-h-0 max-w-full shrink-0 flex-col border-r-2 border-zinc-900 bg-black"
      style={{ width: AGENT_TERMINAL_SURFACE_WIDTH }}
    >
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h2 className="font-ovo text-lg tracking-tight text-zinc-200">Agents</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] font-medium leading-none text-zinc-400">
            {agentTabs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSpawnOpen((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label="New agent"
        >
          <Plus size={16} />
        </button>
      </div>

      {spawnOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-spawn-dialog-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSpawnOpen(false)
            }}
          >
            <div className="mx-4 w-full max-w-sm">
              <AgentSpawnDialog projectFolder={projectFolder} onClose={() => setSpawnOpen(false)} />
            </div>
          </div>,
          document.body
        )}

      <div className="min-h-0 flex-1 overflow-y-auto dark-scrollbar p-3">
        {agentTabs.length === 0 ? (
          <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 px-6 text-center">
            <Terminal size={22} className="text-zinc-700" />
            <div>
              <h3 className="font-ovo text-3xl tracking-tight text-zinc-300">No Agents</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                Running agents will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {agentTabs.map((tab) => (
              <AgentCard key={tab.id} tab={tab} onClose={requestCloseTab} />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
