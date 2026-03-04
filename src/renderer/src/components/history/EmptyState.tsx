import { useState } from 'react'
import { useHistoryStore } from '@renderer/stores/history'

export default function EmptyState(): React.JSX.Element {
  const initRepo = useHistoryStore((s) => s.initRepo)
  const [isInitializing, setIsInitializing] = useState(false)

  const handleInit = async (): Promise<void> => {
    setIsInitializing(true)
    try {
      await initRepo()
    } finally {
      setIsInitializing(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">History</h2>
      <p className="max-w-xs text-sm text-zinc-500">
        Track changes and create save points to restore your project at any time.
      </p>
      <button
        onClick={handleInit}
        disabled={isInitializing}
        aria-busy={isInitializing}
        className="mt-2 rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isInitializing ? 'Initializing...' : 'Initialize'}
      </button>
    </div>
  )
}
