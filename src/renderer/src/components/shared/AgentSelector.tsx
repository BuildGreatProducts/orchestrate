import { useMemo } from 'react'
import { useAgentsStore } from '@renderer/stores/agents'
import { AgentIcon } from '@renderer/lib/agent-icons'

interface AgentSelectorProps {
  value: string
  onChange: (agentId: string) => void
  size?: 'sm' | 'md'
}

export default function AgentSelector({
  value,
  onChange,
  size = 'md'
}: AgentSelectorProps): React.JSX.Element {
  const allAgents = useAgentsStore((s) => s.agents)
  const agents = useMemo(() => allAgents.filter((a) => a.enabled), [allAgents])

  const buttonClass =
    size === 'sm'
      ? 'rounded px-3 py-1 text-xs transition-colors'
      : 'rounded px-3 py-1.5 text-sm transition-colors'

  if (agents.length === 0) {
    return (
      <div className="flex flex-wrap gap-2">
        <span className={`${buttonClass} bg-zinc-800 text-zinc-500 cursor-default`}>
          No agents enabled
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((agent) => (
        <button
          type="button"
          key={agent.id}
          onClick={() => onChange(agent.id)}
          className={`${buttonClass} ${
            value === agent.id
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300'
          } inline-flex items-center`}
        >
          {agent.displayName}
          <AgentIcon agentId={agent.id} className="ml-1.5 h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}
