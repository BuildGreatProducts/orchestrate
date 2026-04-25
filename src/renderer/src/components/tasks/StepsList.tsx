import { useCallback, useState } from 'react'
import { Plus, X, GripVertical, Link2 } from 'lucide-react'
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskStep } from '@shared/types'

function DependencyBadge({
  dependsOn
}: {
  dependsOn: string[]
}): React.JSX.Element | null {
  if (!dependsOn || dependsOn.length === 0) return null

  return (
    <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
      <Link2 size={10} />
      {dependsOn.length}
    </span>
  )
}

function SortableStep({
  step,
  index,
  selected,
  onSelect,
  onDelete,
  canDelete
}: {
  step: TaskStep
  index: number
  selected: boolean
  onSelect: (id: string) => void
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
      onClick={() => onSelect(step.id)}
      className={`cursor-pointer rounded-lg border transition-colors ${
        selected
          ? 'border-zinc-500 bg-zinc-800'
          : 'border-zinc-700/60 bg-zinc-800/50 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder step"
          className="shrink-0 cursor-grab text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>
        <span className="text-[11px] font-medium text-zinc-500">Step {index + 1}</span>
        <DependencyBadge dependsOn={step.dependsOn ?? []} />
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
          {step.prompt || 'Empty step'}
        </p>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(step.id)
            }}
            aria-label="Delete step"
            className="ml-auto shrink-0 text-zinc-600 hover:text-red-400"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

interface StepsListProps {
  steps: TaskStep[]
  selectedStepId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (oldIdx: number, newIdx: number) => void
  onAdd: () => void
}

export default function StepsList({
  steps,
  selectedStepId,
  onSelect,
  onDelete,
  onReorder,
  onAdd
}: StepsListProps): React.JSX.Element {
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
        if (oldIdx === -1 || newIdx === -1) return
        onReorder(oldIdx, newIdx)
      }
    },
    [steps, onReorder]
  )

  return (
    <div>
      <label className="mb-2 block text-xs text-zinc-500">Steps</label>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <SortableStep
                key={step.id}
                step={step}
                index={idx}
                selected={selectedStepId === step.id}
                onSelect={onSelect}
                onDelete={onDelete}
                canDelete={steps.length > 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        onClick={onAdd}
        className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <Plus size={14} />
        Add step
      </button>
    </div>
  )
}
