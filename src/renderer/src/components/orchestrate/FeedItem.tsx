import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import type { TerminalTab } from '@renderer/stores/terminal'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { useMirrorTerminal } from '@renderer/hooks/useMirrorTerminal'

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface FeedItemProps {
  tab: TerminalTab
  projectName: string
}

export default function FeedItem({ tab, projectName }: FeedItemProps): React.JSX.Element {
  const { containerRef } = useMirrorTerminal({ id: tab.id })
  const [, setTick] = useState(0)

  // Re-render periodically to keep the relative time fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const handleGoToTerminal = (): void => {
    useTerminalStore.getState().setActiveTab(tab.id)
    useAppStore.getState().showProjectDetail(tab.projectFolder)
  }

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
            {projectName}
          </span>
          <span className="text-zinc-500">/</span>
          <span className="font-medium text-zinc-200">{tab.name}</span>
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          {tab.bellAt && <span className="text-xs text-zinc-500">{timeAgo(tab.bellAt)}</span>}
        </div>
        <button
          onClick={handleGoToTerminal}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Go to terminal"
        >
          <ExternalLink size={12} />
          <span>Open</span>
        </button>
      </div>

      {/* Mini terminal */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Terminal preview"
        className="h-[240px] overflow-hidden"
        style={{ padding: '4px 0 0 4px' }}
      />
    </div>
  )
}
