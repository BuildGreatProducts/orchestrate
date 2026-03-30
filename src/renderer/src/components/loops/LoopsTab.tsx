import { useEffect } from 'react'
import { useLoopsStore } from '@renderer/stores/loops'
import { useAppStore } from '@renderer/stores/app'
import { executeLoop } from '@renderer/stores/loop-execution-engine'
import { toast } from '@renderer/stores/toast'
import { Button } from '@renderer/components/ui/button'
import LoopCard from './LoopCard'
import LoopEditorModal from './LoopEditorModal'
import type { Loop } from '@shared/types'

export default function LoopsTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const loops = useLoopsStore((s) => s.loops)
  const hasLoaded = useLoopsStore((s) => s.hasLoaded)
  const loadLoops = useLoopsStore((s) => s.loadLoops)
  const editingLoop = useLoopsStore((s) => s.editingLoop)
  const setEditingLoop = useLoopsStore((s) => s.setEditingLoop)
  const createLoop = useLoopsStore((s) => s.createLoop)
  const updateLoop = useLoopsStore((s) => s.updateLoop)
  const deleteLoop = useLoopsStore((s) => s.deleteLoop)
  const resetLoops = useLoopsStore((s) => s.resetLoops)

  // Listen for schedule triggers
  useEffect(() => {
    const cleanup = window.orchestrate.onLoopTrigger((loopId) => {
      executeLoop(loopId)
    })
    return cleanup
  }, [])

  useEffect(() => {
    setEditingLoop(null)
    if (currentFolder) {
      loadLoops()
    } else {
      resetLoops()
    }
  }, [currentFolder, loadLoops, resetLoops, setEditingLoop])

  const handleSave = async (
    data: Omit<Loop, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<void> => {
    try {
      if (data.id) {
        const existing = loops.find((l) => l.id === data.id)
        if (!existing) {
          toast.error('Loop not found — it may have been deleted')
          return
        }
        await updateLoop({
          ...existing,
          name: data.name,
          steps: data.steps,
          schedule: data.schedule,
          agentType: data.agentType,
          lastRun: data.lastRun ?? existing.lastRun
        })
      } else {
        await createLoop(data)
      }
      setEditingLoop(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save loop: ${msg}`)
    }
  }

  const modal = editingLoop !== null && (
    <LoopEditorModal
      initial={editingLoop}
      onSave={handleSave}
      onCancel={() => setEditingLoop(null)}
    />
  )

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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Loops</h2>
        <p className="max-w-xs text-sm text-zinc-500">
          Create automation loops — multi-step sequences that run agents in order.
        </p>
        <Button variant="solid" onClick={() => setEditingLoop({})} className="mt-2">
          New loop
        </Button>
        {modal}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
              onRun={(id) => executeLoop(id)}
              onEdit={(l) => setEditingLoop(l)}
              onDelete={(id) => deleteLoop(id)}
            />
          ))}
        </div>
      </div>

      {modal}
    </div>
  )
}
