import { useHistoryStore } from '@renderer/stores/history'
import SavePointCard from './SavePointCard'
import type { SavePoint } from '@shared/types'

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDate(items: SavePoint[]): { label: string; points: SavePoint[] }[] {
  const groups: { label: string; points: SavePoint[] }[] = []
  let currentLabel = ''

  for (const point of items) {
    const label = getDateLabel(point.date)
    if (label !== currentLabel) {
      groups.push({ label, points: [point] })
      currentLabel = label
    } else {
      groups[groups.length - 1].points.push(point)
    }
  }
  return groups
}

export default function SavePointList(): React.JSX.Element {
  const history = useHistoryStore((s) => s.history)
  const expandedHash = useHistoryStore((s) => s.expandedHash)
  const expandedDetail = useHistoryStore((s) => s.expandedDetail)
  const detailLoading = useHistoryStore((s) => s.detailLoading)
  const toggleDetail = useHistoryStore((s) => s.toggleDetail)
  const requestRevert = useHistoryStore((s) => s.requestRevert)
  const requestRestore = useHistoryStore((s) => s.requestRestore)
  const openDiff = useHistoryStore((s) => s.openDiff)

  if (history.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-zinc-500">
        No save points yet. Make some changes and create your first save point.
      </div>
    )
  }

  const groups = groupByDate(history)

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="sticky top-0 z-10 bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-500 backdrop-blur-sm">
            {group.label}
          </div>
          {group.points.map((point) => (
            <SavePointCard
              key={point.hash}
              savePoint={point}
              isExpanded={expandedHash === point.hash}
              detail={expandedHash === point.hash ? expandedDetail : null}
              detailLoading={expandedHash === point.hash && detailLoading}
              onToggleExpand={() => toggleDetail(point.hash)}
              onRevert={() => requestRevert(point.hash)}
              onRestore={() => requestRestore(point.hash)}
              onViewDiff={(filePath) => openDiff(point.hash, filePath)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
