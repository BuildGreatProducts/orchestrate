import { useState } from 'react'
import { useAgentStore } from '../../stores/agent'

interface ApiKeyPromptProps {
  onDone?: () => void
}

export default function ApiKeyPrompt({ onDone }: ApiKeyPromptProps): React.JSX.Element {
  const [key, setKey] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setApiKey = useAgentStore((s) => s.setApiKey)
  const hasApiKey = useAgentStore((s) => s.hasApiKey)

  const isEditing = hasApiKey === true

  const handleConnect = async (): Promise<void> => {
    if (!key.trim()) return
    setIsConnecting(true)
    setError(null)
    try {
      await setApiKey(key.trim())
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set API key')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-zinc-200">
          {isEditing ? 'Update API Key' : 'Connect to Claude'}
        </h2>
        <p className="text-sm text-zinc-400">
          {isEditing
            ? 'Enter a new API key to replace the current one.'
            : 'Enter your Anthropic API key to enable the AI project manager.'}
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConnect()
            if (e.metaKey || e.ctrlKey) e.stopPropagation()
          }}
          placeholder="sk-ant-..."
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
        />

        {error && (
          <p className="rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={handleConnect}
          disabled={!key.trim() || isConnecting}
          className="rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnecting ? 'Saving...' : isEditing ? 'Update Key' : 'Connect'}
        </button>

        <p className="text-xs text-zinc-500">
          Get an API key at{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 underline hover:text-zinc-300"
          >
            console.anthropic.com
          </a>
        </p>
      </div>
    </div>
  )
}
