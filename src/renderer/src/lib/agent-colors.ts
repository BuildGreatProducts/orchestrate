import type { TerminalTab } from '@renderer/stores/terminal'

export const AGENT_COLORS = [
  { name: 'blue', bg: 'bg-blue-400' },
  { name: 'green', bg: 'bg-green-400' },
  { name: 'violet', bg: 'bg-violet-400' },
  { name: 'cyan', bg: 'bg-cyan-400' },
  { name: 'rose', bg: 'bg-rose-400' },
  { name: 'emerald', bg: 'bg-emerald-400' },
  { name: 'orange', bg: 'bg-orange-400' },
  { name: 'fuchsia', bg: 'bg-fuchsia-400' }
] as const

export const ATTENTION_BG = 'bg-amber-500'

export function getAgentColorIndex(tabId: string, projectTabs: TerminalTab[]): number {
  const idx = projectTabs.findIndex((t) => t.id === tabId)
  return (idx === -1 ? 0 : idx) % AGENT_COLORS.length
}
