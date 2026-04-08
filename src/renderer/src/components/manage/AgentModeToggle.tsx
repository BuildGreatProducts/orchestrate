import { useEffect } from 'react'
import { Terminal, Key } from 'lucide-react'
import { useAgentStore } from '../../stores/agent'

export default function AgentModeToggle(): React.JSX.Element {
  const agentMode = useAgentStore((s) => s.agentMode)
  const cliAvailable = useAgentStore((s) => s.cliAvailable)
  const loadAgentMode = useAgentStore((s) => s.loadAgentMode)
  const setAgentMode = useAgentStore((s) => s.setAgentMode)
  const checkCliAvailable = useAgentStore((s) => s.checkCliAvailable)

  useEffect(() => {
    loadAgentMode()
    checkCliAvailable()
  }, [loadAgentMode, checkCliAvailable])

  if (agentMode === null) return <></>

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-zinc-800/80 p-0.5">
      <button
        onClick={() => setAgentMode('cli')}
        disabled={cliAvailable === false}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          agentMode === 'cli'
            ? 'bg-zinc-700 text-zinc-100'
            : cliAvailable === false
              ? 'cursor-not-allowed text-zinc-600'
              : 'text-zinc-400 hover:text-zinc-300'
        }`}
        title={
          cliAvailable === false
            ? 'Claude CLI not installed. Run: npm install -g @anthropic-ai/claude-code'
            : 'Use your Claude Code subscription'
        }
      >
        <Terminal size={12} />
        CLI
        {cliAvailable === false && (
          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
        )}
      </button>
      <button
        onClick={() => setAgentMode('sdk')}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          agentMode === 'sdk'
            ? 'bg-zinc-700 text-zinc-100'
            : 'text-zinc-400 hover:text-zinc-300'
        }`}
        title="Use Anthropic API key"
      >
        <Key size={12} />
        API
      </button>
    </div>
  )
}
