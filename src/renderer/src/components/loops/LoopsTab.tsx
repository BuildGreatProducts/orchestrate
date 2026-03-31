import { useEffect } from 'react'
import { useLoopsStore } from '@renderer/stores/loops'
import { useAppStore } from '@renderer/stores/app'
import { Button } from '@renderer/components/ui/button'
import LoopCard from './LoopCard'
import LoopDetailPanel from './LoopDetailPanel'

export default function LoopsTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const loops = useLoopsStore((s) => s.loops)
  const hasLoaded = useLoopsStore((s) => s.hasLoaded)
  const loadLoops = useLoopsStore((s) => s.loadLoops)
  const editingLoop = useLoopsStore((s) => s.editingLoop)
  const setEditingLoop = useLoopsStore((s) => s.setEditingLoop)
  const deleteLoop = useLoopsStore((s) => s.deleteLoop)
  const resetLoops = useLoopsStore((s) => s.resetLoops)

  useEffect(() => {
    setEditingLoop(null)
    if (currentFolder) {
      loadLoops()
    } else {
      resetLoops()
    }
  }, [currentFolder, loadLoops, resetLoops, setEditingLoop])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Loops</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Select a project folder to get started with loops.
        </p>
      </div>
    )
  }

  if (hasLoaded && loops.length === 0) {
    return (
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Loops</h2>
          <p className="max-w-xs text-sm text-zinc-500">
            Create automation loops — multi-step sequences that run agents in order.
          </p>
          <Button variant="solid" onClick={() => setEditingLoop({})} className="mt-2">
            New loop
          </Button>
        </div>
        <LoopDetailPanel />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Loops</h2>
        <Button variant="solid" size="sm" onClick={() => setEditingLoop({})}>
          New loop
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loops.map((loop) => (
            <LoopCard
              key={loop.id}
              loop={loop}
              onSelect={(l) => setEditingLoop(l)}
              onDelete={(id) => deleteLoop(id)}
              isSelected={editingLoop?.id === loop.id}
            />
          ))}
        </div>
      </div>

      <LoopDetailPanel />
    </div>
  )
}
