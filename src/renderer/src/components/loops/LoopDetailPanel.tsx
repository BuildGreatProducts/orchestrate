import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, GripVertical, Play, Square } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nanoid } from 'nanoid'
import type { Loop, LoopStep, AgentType } from '@shared/types'
import { useLoopsStore } from '@renderer/stores/loops'
import { executeLoop, isLoopRunning, abortLoop } from '@renderer/stores/loop-execution-engine'
import { toast } from '@renderer/stores/toast'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'

const SCHEDULE_PRESETS = [
  { label: 'Manual (no schedule)', cron: '' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { label: 'Custom', cron: '__custom__' }
]

function SortableStep({
  step,
  index,
  onChange,
  onDelete,
  canDelete
}: {
  step: LoopStep
  index: number
  onChange: (id: string, prompt: string) => void
  onDelete: (id: string) => void
  canDelete: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: step.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-zinc-700/60 bg-zinc-800/50">
      <div className="flex items-center gap-2 border-b border-zinc-700/40 px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder step"
          className="shrink-0 cursor-grab text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <span className="text-[11px] font-medium text-zinc-500">Step {index + 1}</span>
        {canDelete && (
          <button
            onClick={() => onDelete(step.id)}
            aria-label="Delete step"
            className="ml-auto shrink-0 text-zinc-600 hover:text-red-400"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="px-3 py-2.5">
        <textarea
          value={step.prompt}
          onChange={(e) => onChange(step.id, e.target.value)}
          placeholder="Describe what this step should do..."
          rows={2}
          className="w-full resize-none rounded border-0 bg-transparent p-0 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  )
}

export default function LoopDetailPanel(): React.JSX.Element | null {
  const loops = useLoopsStore((s) => s.loops)
  const editingLoop = useLoopsStore((s) => s.editingLoop)
  const setEditingLoop = useLoopsStore((s) => s.setEditingLoop)
  const createLoop = useLoopsStore((s) => s.createLoop)
  const updateLoop = useLoopsStore((s) => s.updateLoop)
  const deleteLoop = useLoopsStore((s) => s.deleteLoop)

  const [name, setName] = useState('')
  const [agentType, setAgentType] = useState<AgentType>('claude-code')
  const [steps, setSteps] = useState<LoopStep[]>([{ id: nanoid(6), prompt: '' }])
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [cron, setCron] = useState('')
  const [preset, setPreset] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isEdit = !!editingLoop?.id
  const loopId = editingLoop?.id ?? null
  const existingLoop = loopId ? loops.find((l) => l.id === loopId) ?? null : null
  const running = existingLoop
    ? isLoopRunning(existingLoop.id) || existingLoop.lastRun?.status === 'running'
    : false

  // Sync form state when editingLoop changes
  useEffect(() => {
    if (!editingLoop) return
    setName(editingLoop.name ?? '')
    setAgentType(editingLoop.agentType ?? 'claude-code')
    setSteps(
      editingLoop.steps?.length
        ? editingLoop.steps
        : [{ id: nanoid(6), prompt: '' }]
    )
    setScheduleEnabled(editingLoop.schedule?.enabled ?? false)
    const c = editingLoop.schedule?.cron ?? ''
    setCron(c)
    if (!editingLoop.schedule?.enabled || !c) {
      setPreset('')
    } else {
      const match = SCHEDULE_PRESETS.find((p) => p.cron === c)
      setPreset(match ? match.cron : '__custom__')
    }
    setMenuOpen(false)
    setConfirmingDelete(false)
  }, [editingLoop])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIdx = steps.findIndex((s) => s.id === active.id)
        const newIdx = steps.findIndex((s) => s.id === over.id)
        setSteps(arrayMove(steps, oldIdx, newIdx))
      }
    },
    [steps]
  )

  const handleStepChange = useCallback((id: string, prompt: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, prompt } : s)))
  }, [])

  const handleStepDelete = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, { id: nanoid(6), prompt: '' }])
  }, [])

  const handlePresetChange = useCallback((value: string) => {
    setPreset(value)
    if (value === '') {
      setScheduleEnabled(false)
      setCron('')
    } else if (value === '__custom__') {
      setScheduleEnabled(false)
    } else {
      setScheduleEnabled(true)
      setCron(value)
    }
  }, [])

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const validSteps = steps.filter((s) => s.prompt.trim())
    if (validSteps.length === 0) return

    try {
      if (isEdit && existingLoop) {
        await updateLoop({
          ...existingLoop,
          name: trimmedName,
          steps: validSteps,
          schedule: { enabled: scheduleEnabled && cron.trim().length > 0, cron: cron.trim() },
          agentType
        })
      } else {
        await createLoop({
          name: trimmedName,
          steps: validSteps,
          schedule: { enabled: scheduleEnabled && cron.trim().length > 0, cron: cron.trim() },
          agentType
        })
      }
      setEditingLoop(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save loop: ${msg}`)
    }
  }, [name, steps, scheduleEnabled, cron, agentType, isEdit, existingLoop, createLoop, updateLoop, setEditingLoop])

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    setConfirmingDelete(true)
  }, [])

  const handleRun = useCallback(() => {
    if (existingLoop) executeLoop(existingLoop.id)
  }, [existingLoop])

  const handleStop = useCallback(() => {
    if (existingLoop) abortLoop(existingLoop.id)
  }, [existingLoop])

  const canSave = name.trim() && steps.some((s) => s.prompt.trim())

  if (!editingLoop) return null

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-1/2 max-w-[700px] flex-col border-l border-zinc-800 bg-zinc-900 shadow-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-ovo text-xl text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder="Loop name"
          autoFocus={!isEdit}
        />
        <div className="mt-1 flex flex-shrink-0 items-center gap-1">
          {isEdit && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-32 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                  <button
                    onClick={handleDelete}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setEditingLoop(null)}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Agent type */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Agent</label>
          <div className="flex gap-2">
            {(['claude-code', 'codex'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setAgentType(type)}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  agentType === type
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300'
                }`}
              >
                {type === 'claude-code' ? 'Claude Code' : 'Codex'}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Schedule</label>
          <select
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-500"
          >
            {SCHEDULE_PRESETS.map((p) => (
              <option key={p.cron} value={p.cron}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === '__custom__' && (
            <input
              type="text"
              value={cron}
              onChange={(e) => {
                setCron(e.target.value)
                setScheduleEnabled(e.target.value.trim().length > 0)
              }}
              placeholder="e.g. 0 9 * * 1-5"
              className="mt-1.5 w-full rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
            />
          )}
        </div>

        {/* Steps */}
        <div>
          <label className="mb-2 block text-xs text-zinc-500">Steps</label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <SortableStep
                    key={step.id}
                    step={step}
                    index={idx}
                    onChange={handleStepChange}
                    onDelete={handleStepDelete}
                    canDelete={steps.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            onClick={addStep}
            className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <Plus size={14} />
            Add step
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
        <div>
          {isEdit && (
            running ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-800"
              >
                <Square size={12} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-green-400 hover:bg-zinc-800"
              >
                <Play size={12} />
                Run
              </button>
            )
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="rounded bg-white px-4 py-1.5 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] disabled:opacity-40 disabled:hover:bg-white"
        >
          {isEdit ? 'Save' : 'Create'}
        </button>
      </div>

      {confirmingDelete && existingLoop && (
        <ConfirmDialog
          title="Delete loop"
          description={`Are you sure you want to delete "${existingLoop.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            setConfirmingDelete(false)
            deleteLoop(existingLoop.id)
            setEditingLoop(null)
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
