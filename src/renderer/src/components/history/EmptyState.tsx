import { VscRepo } from 'react-icons/vsc'
import { useHistoryStore } from '@renderer/stores/history'

export default function EmptyState(): React.JSX.Element {
  const initRepo = useHistoryStore((s) => s.initRepo)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <VscRepo size={48} className="text-zinc-600" />
      <h2 className="text-xl font-semibold text-zinc-200">No Version History</h2>
      <p className="text-sm text-zinc-500">Initialize to start creating save points</p>
      <button
        onClick={initRepo}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Initialize
      </button>
    </div>
  )
}
