import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Terminal, Trash2 } from 'lucide-react'

interface TerminalTab {
  id: string
  name: string
  exited: boolean
  exitCode?: number
}

interface DraggableAgentItemProps {
  tab: TerminalTab
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
  isDragOverlay?: boolean
}

export default function DraggableAgentItem({
  tab,
  isActive,
  onSelect,
  onClose,
  isDragOverlay
}: DraggableAgentItemProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: isDragOverlay
  })

  const style = !isDragOverlay
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
      }
    : undefined

  return (
    <button
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={style}
      {...(!isDragOverlay ? attributes : {})}
      {...(!isDragOverlay ? listeners : {})}
      onClick={() => onSelect(tab.id)}
      className={`group flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
        isActive
          ? 'bg-zinc-800 text-white'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      } ${isDragOverlay ? 'cursor-grabbing bg-zinc-800 text-white shadow-lg ring-1 ring-zinc-600' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <Terminal size={14} className="flex-shrink-0 text-zinc-500" />

      <span className="flex-1 truncate text-left">
        {tab.name}
        {tab.exited && <span className="ml-1 text-zinc-500">(exited)</span>}
      </span>

      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            onClose(tab.id)
          }
        }}
        className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-600 group-hover:opacity-100"
      >
        <Trash2 size={13} className="text-zinc-500 hover:text-red-400" />
      </span>
    </button>
  )
}
