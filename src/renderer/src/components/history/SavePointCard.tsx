import { VscChevronRight, VscChevronDown } from 'react-icons/vsc'
import type { SavePoint, SavePointDetail } from '@shared/types'
import FileChangeList from './FileChangeList'

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

export default function SavePointCard({
  savePoint,
  isExpanded,
  detail,
  detailLoading,
  onToggleExpand,
  onRevert,
  onRestore,
  onViewDiff
}: {
  savePoint: SavePoint
  isExpanded: boolean
  detail: SavePointDetail | null
  detailLoading: boolean
  onToggleExpand: () => void
  onRevert: () => void
  onRestore: () => void
  onViewDiff: (filePath: string) => void
}): React.JSX.Element {
  const Chevron = isExpanded ? VscChevronDown : VscChevronRight

  return (
    <div className="border-b border-zinc-800/50">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpand()
          }
        }}
        className="group flex cursor-pointer items-start gap-2 px-3 py-2.5 hover:bg-zinc-800/50"
      >
        <Chevron size={16} className="mt-0.5 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-200">
              {savePoint.message}
            </span>
            {savePoint.isAutoSave && (
              <span className="shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                Auto
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
            <span>{formatRelativeDate(savePoint.date)}</span>
            <span className="text-zinc-700">&middot;</span>
            <span>
              {savePoint.filesChanged} {savePoint.filesChanged === 1 ? 'file' : 'files'}
            </span>
            {savePoint.insertions > 0 && (
              <span className="text-green-500">+{savePoint.insertions}</span>
            )}
            {savePoint.deletions > 0 && (
              <span className="text-red-500">-{savePoint.deletions}</span>
            )}
          </div>
        </div>
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
      </div>

      {isExpanded && (
        <div className="px-3 pb-2">
          {detailLoading && (
            <p className="py-2 text-xs text-zinc-600">Loading changes...</p>
          )}
          {detail && <FileChangeList files={detail.files} onViewDiff={onViewDiff} />}
        </div>
      )}
    </div>
  )
}
