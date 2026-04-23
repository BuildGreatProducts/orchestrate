import { useState } from 'react'
import { ChevronDown, ChevronRight, GitBranch, Send, Terminal, Trash2 } from 'lucide-react'
import type { TerminalTab } from '@renderer/stores/terminal'
import { useMirrorTerminal } from '@renderer/hooks/useMirrorTerminal'

interface AgentCardProps {
  tab: TerminalTab
  onClose: (id: string) => void
}

function getStatus(tab: TerminalTab): { label: string; className: string } {
  if (tab.exited) {
    return { label: `Exited${tab.exitCode !== undefined ? ` ${tab.exitCode}` : ''}`, className: 'bg-zinc-700 text-zinc-300' }
  }
  if (tab.bell) {
    return { label: 'Needs input', className: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25' }
  }
  if (tab.busy) {
    return { label: 'Running', className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25' }
  }
  return { label: 'Idle', className: 'bg-zinc-800 text-zinc-400' }
}

export default function AgentCard({ tab, onClose }: AgentCardProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [message, setMessage] = useState('')
  const { containerRef } = useMirrorTerminal({ id: tab.id })
  const status = getStatus(tab)

  const handleSend = (): void => {
    const trimmed = message.trim()
    if (!trimmed) return
    window.orchestrate.writeTerminal(tab.id, `${trimmed}\r`)
    setMessage('')
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex min-h-11 items-center gap-2 border-b border-zinc-800 px-3">
        <Terminal size={14} className="shrink-0 text-zinc-500" />
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={!collapsed}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-200">{tab.name}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-zinc-500">
            <GitBranch size={10} className="shrink-0" />
            <span className="truncate font-mono">{tab.branchName ?? 'current branch'}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={collapsed ? 'Expand agent' : 'Collapse agent'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <button
          type="button"
          onClick={() => onClose(tab.id)}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
          aria-label={`Close ${tab.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className={collapsed ? 'h-0 overflow-hidden' : ''}>
        <div
          ref={containerRef}
          tabIndex={collapsed ? -1 : 0}
          role="region"
          aria-label={`${tab.name} terminal`}
          aria-hidden={collapsed}
          className={`overflow-hidden bg-black transition-[height] duration-150 ${
            collapsed ? 'h-0' : 'h-64'
          }`}
          style={{ padding: collapsed ? 0 : '4px 0 0 4px' }}
        />
        {!collapsed && (
          <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Send message..."
              className="h-8 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-zinc-950 transition-colors hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
