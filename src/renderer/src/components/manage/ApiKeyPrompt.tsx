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
    <div className="flex flex-1 items-center justify-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-200">
            {isEditing ? 'Update API Key' : 'Connect to Claude'}
          </h2>
          {isEditing && onDone && (
            <button
              onClick={onDone}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
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
          className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2">
          {isEditing && onDone && (
            <button
              onClick={onDone}
              className="flex-1 rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleConnect}
            disabled={!key.trim() || isConnecting}
            className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? 'Saving...' : isEditing ? 'Update Key' : 'Connect'}
          </button>
        </div>

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
