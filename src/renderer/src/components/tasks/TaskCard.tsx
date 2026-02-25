import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskMeta } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'

interface TaskCardProps {
  id: string
  task: TaskMeta
  isDragOverlay?: boolean
}

export default function TaskCard({ id, task, isDragOverlay }: TaskCardProps): React.JSX.Element {
  const selectTask = useTasksStore((s) => s.selectTask)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  const isSelected = selectedTaskId === id

  const createdDate = new Date(task.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
      onClick={() => selectTask(id)}
      className={`cursor-grab rounded-lg border p-3 transition-colors active:cursor-grabbing ${
        isSelected
          ? 'border-indigo-500 bg-zinc-800'
          : 'border-zinc-700 bg-zinc-800/80 hover:border-zinc-600'
      }`}
    >
      <p className="line-clamp-2 text-sm text-zinc-200">{task.title}</p>
      <p className="mt-1.5 text-xs text-zinc-500">{createdDate}</p>
    </div>
  )
}
