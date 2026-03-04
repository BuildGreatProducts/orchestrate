import type { CommitNode } from '@shared/types'

const ROW_HEIGHT = 40

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function parseRefTags(refs: string[]): { label: string; color: string }[] {
  const colors: Record<string, string> = {
    main: 'bg-blue-500/20 text-blue-400',
    master: 'bg-blue-500/20 text-blue-400',
    HEAD: 'bg-violet-500/20 text-violet-400'
  }
  const defaultColor = 'bg-zinc-700 text-zinc-400'

  return refs.map((ref) => {
    const cleanRef = ref.replace(/^HEAD -> /, '')
    const isHead = ref.startsWith('HEAD -> ')
    const colorKey = isHead ? 'HEAD' : cleanRef.split('/').pop() ?? ''
    return {
      label: cleanRef,
      color: colors[colorKey] ?? defaultColor
    }
  })
}

export default function CommitRow({
  commit,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onRevert,
  onRestore
}: {
  commit: CommitNode
  isSelected: boolean
  isHovered: boolean
  onSelect: () => void
  onHover: (hovered: boolean) => void
  onRevert: () => void
  onRestore: () => void
}): React.JSX.Element {
  const tags = parseRefTags(commit.refs)
  const shortHash = commit.hash.slice(0, 7)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`group flex cursor-pointer items-center gap-2 px-3 ${
        isSelected
          ? 'bg-zinc-800'
          : isHovered
            ? 'bg-zinc-800/50'
            : ''
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="truncate text-sm text-zinc-200">{commit.message}</span>
        {tags.map((tag) => (
          <span
            key={tag.label}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${tag.color}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRevert()
            }}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          >
            Revert
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestore()
            }}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          >
            Restore
          </button>
        </div>
        <span className="text-xs text-zinc-500">{formatRelativeDate(commit.date)}</span>
        <span className="font-mono text-xs text-zinc-600">{shortHash}</span>
      </div>
    </div>
  )
}
