import { useState } from 'react'
import { useHistoryStore } from '@renderer/stores/history'
import { Button } from '@renderer/components/ui/button'

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
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">History</h2>
      <p className="max-w-xs text-sm text-zinc-500">
        Track changes and create save points to restore your project at any time.
      </p>
      <Button variant="solid" onClick={handleInit} disabled={isInitializing} className="mt-2">
        {isInitializing ? 'Initializing...' : 'Initialize'}
      </Button>
    </div>
  )
}
