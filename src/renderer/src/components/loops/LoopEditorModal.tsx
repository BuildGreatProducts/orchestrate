import { useState, useCallback } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
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
import type { Loop, LoopStep } from '@shared/types'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAgentsStore } from '@renderer/stores/agents'
import { toast } from '@renderer/stores/toast'
import AgentSelector from '@renderer/components/shared/AgentSelector'

interface LoopEditorModalProps {
  initial: Partial<Loop> | null
  onSave: (loop: Omit<Loop, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void> | void
  onCancel: () => void
}

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
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-700/60 bg-zinc-800/50"
    >
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

export default function LoopEditorModal({
  initial,
  onSave,
  onCancel
}: LoopEditorModalProps): React.JSX.Element {
  const isEdit = !!initial?.id

  const allAgents = useAgentsStore((s) => s.agents)
  const [name, setName] = useState(initial?.name ?? '')
  const [agentType, setAgentType] = useState(() => {
    const enabled = allAgents.filter((a) => a.enabled)
    const preferred = initial?.agentType
    if (preferred && enabled.some((a) => a.id === preferred)) return preferred
    return enabled[0]?.id ?? 'claude-code'
  })
  const [steps, setSteps] = useState<LoopStep[]>(
    initial?.steps?.length
      ? initial.steps
      : [{ id: nanoid(6), prompt: '' }]
  )
  const [scheduleEnabled, setScheduleEnabled] = useState(initial?.schedule?.enabled ?? false)
  const [cron, setCron] = useState(initial?.schedule?.cron ?? '')
  const [preset, setPreset] = useState(() => {
    if (!initial?.schedule?.enabled || !initial?.schedule?.cron) return ''
    const match = SCHEDULE_PRESETS.find((p) => p.cron === initial.schedule!.cron)
    return match ? match.cron : '__custom__'
  })
  const [groupSelect, setGroupSelect] = useState(initial?.groupName ?? '')
  const [newGroupName, setNewGroupName] = useState('')
  const terminalGroups = useTerminalStore((s) => s.groups)

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
      // Don't enable schedule until cron is actually filled in
      setScheduleEnabled(false)
    } else {
      setScheduleEnabled(true)
      setCron(value)
    }
  }, [])

  const resolvedGroupName = groupSelect === '__new__'
    ? newGroupName.trim() || undefined
    : groupSelect || undefined

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const validSteps = steps.filter((s) => s.prompt.trim())
    if (validSteps.length === 0) return

    // Validate agent is still enabled
    const enabled = useAgentsStore.getState().agents.filter((a) => a.enabled)
    if (enabled.length === 0) {
      toast.error('No agents enabled — enable one in Settings first')
      return
    }
    const validAgent = enabled.some((a) => a.id === agentType)
      ? agentType
      : enabled[0].id

    try {
      await onSave({
        ...(isEdit ? { id: initial!.id } : {}),
        name: trimmedName,
        steps: validSteps,
        schedule: { enabled: scheduleEnabled && cron.trim().length > 0, cron: cron.trim() },
        agentType: validAgent,
        lastRun: initial?.lastRun,
        groupName: resolvedGroupName
      })
    } catch (err) {
      console.error('[LoopEditor] Save failed:', err)
    }
  }, [name, steps, scheduleEnabled, cron, agentType, isEdit, initial, onSave, resolvedGroupName])

  const canSave = name.trim() && steps.some((s) => s.prompt.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">
            {isEdit ? 'Edit Loop' : 'New Loop'}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning code review"
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Agent Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Agent</label>
            <AgentSelector value={agentType} onChange={setAgentType} />
          </div>

          {/* Steps */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">Steps</label>
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

          {/* Agent Group */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Agent Group</label>
            {(() => {
              const selectVal = groupSelect === '__new__' ? '__new__' : (groupSelect || '')
              const savedName = selectVal && selectVal !== '__new__' ? selectVal : null
              const existsInGroups = savedName && terminalGroups.some((g) => g.name === savedName)
              return (
                <select
                  value={selectVal}
                  onChange={(e) => {
                    setGroupSelect(e.target.value)
                    if (e.target.value !== '__new__') setNewGroupName('')
                  }}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
                >
                  <option value="">Default (loop name)</option>
                  {savedName && !existsInGroups && (
                    <option value={savedName}>{savedName}</option>
                  )}
                  {terminalGroups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                  <option value="__new__">+ Create new group</option>
                </select>
              )
            })()}
            {groupSelect === '__new__' && (
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Schedule</label>
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
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
                className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100"
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
