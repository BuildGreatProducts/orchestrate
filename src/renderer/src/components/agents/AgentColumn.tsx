import { useMemo, useState } from 'react'
import { Plus, Terminal } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { AGENT_TERMINAL_SURFACE_WIDTH } from '@renderer/lib/layout-constants'
import AgentCard from './AgentCard'
import AgentSpawnDialog from './AgentSpawnDialog'

interface AgentColumnProps {
  projectFolder: string
}

export default function AgentColumn({ projectFolder }: AgentColumnProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const requestCloseTab = useTerminalStore((s) => s.requestCloseTab)
  const [spawnOpen, setSpawnOpen] = useState(false)

  const agentTabs = useMemo(
    () => tabs.filter((tab) => tab.projectFolder === projectFolder && tab.kind === 'agent'),
    [tabs, projectFolder]
  )

  return (
    <aside
      className="flex min-h-0 max-w-full shrink-0 flex-col rounded-lg border border-zinc-800 bg-black"
      style={{ width: AGENT_TERMINAL_SURFACE_WIDTH }}
    >
      <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Agents</h2>
          <p className="text-xs text-zinc-600">{agentTabs.length} terminal agent{agentTabs.length === 1 ? '' : 's'}</p>
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

      {spawnOpen && (
        <div className="border-b border-zinc-800 p-3">
          <AgentSpawnDialog projectFolder={projectFolder} onClose={() => setSpawnOpen(false)} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto dark-scrollbar p-3">
        {agentTabs.length === 0 ? (
          <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 text-center">
            <Terminal size={22} className="text-zinc-700" />
            <div>
              <p className="text-sm text-zinc-500">No agents running</p>
              <p className="mt-1 text-xs text-zinc-700">Start an agent from a branch to see it here.</p>
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
