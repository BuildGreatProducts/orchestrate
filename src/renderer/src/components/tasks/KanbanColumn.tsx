import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ColumnId, TaskMeta } from '@shared/types'
import { useTasksStore } from '@renderer/stores/tasks'
import TaskCard from './TaskCard'

const COLUMN_LABELS: Record<ColumnId, string> = {
  draft: 'Draft',
  planning: 'Planning',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done'
}

interface KanbanColumnProps {
  columnId: ColumnId
  taskIds: string[]
  tasks: Record<string, TaskMeta>
}

export default function KanbanColumn({
  columnId,
  taskIds,
  tasks
}: KanbanColumnProps): React.JSX.Element {
  const createTask = useTasksStore((s) => s.createTask)
  const { isOver, setNodeRef } = useDroppable({ id: columnId })

  const handleAdd = (): void => {
    createTask(columnId, 'New task')
  }

  return (
    <div className="flex w-64 flex-shrink-0 flex-col rounded-lg bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-300">{COLUMN_LABELS[columnId]}</h3>
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
            {taskIds.length}
          </span>
        </div>
        <button
          onClick={handleAdd}
          aria-label="Add task"
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors ${
          isOver ? 'bg-zinc-800/50' : ''
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {taskIds.map((id) => {
            const task = tasks[id]
            if (!task) return null
            return <TaskCard key={id} id={id} task={task} />
          })}
        </SortableContext>
      </div>
    </div>
  )
}
