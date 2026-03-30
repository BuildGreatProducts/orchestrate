import { useState, useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useTerminalStore, type AgentGroup, type TerminalTab } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { toast } from '@renderer/stores/toast'
import DraggableAgentItem from './DraggableAgentItem'

interface AgentGroupSectionProps {
  group: AgentGroup
  tabs: TerminalTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export default function AgentGroupSection({
  group,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab
}: AgentGroupSectionProps): React.JSX.Element {
  const renameGroup = useTerminalStore((s) => s.renameGroup)
  const toggleGroupCollapsed = useTerminalStore((s) => s.toggleGroupCollapsed)
  const deleteGroup = useTerminalStore((s) => s.deleteGroup)
  const removeTabFromGroup = useTerminalStore((s) => s.removeTabFromGroup)
  const createTabInGroup = useTerminalStore((s) => s.createTabInGroup)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const { isOver, setNodeRef } = useDroppable({ id: group.id })

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming])

  const commitRename = (): void => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== group.name) {
      renameGroup(group.id, trimmed)
    }
    setIsRenaming(false)
  }

  const handleAddAgent = async (): Promise<void> => {
    if (currentFolder) {
      try {
        await createTabInGroup(currentFolder, group.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Failed to create terminal: ${msg}`)
      }
    }
  }

  // Filter tabs to only those in this group, preserving group order
  const tabById = new Map(tabs.map((t) => [t.id, t]))
  const groupTabs = group.tabIds
    .map((id) => tabById.get(id))
    .filter((t): t is TerminalTab => t !== undefined)

  return (
    <div className="mt-1">
      {/* Group header */}
      <div className="group/header flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-zinc-800/50">
        <button
          onClick={() => toggleGroupCollapsed(group.id)}
          aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
        >
          {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setRenameValue(group.name)
                setIsRenaming(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-zinc-200 outline-none focus:border-zinc-400"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onDoubleClick={() => {
              setRenameValue(group.name)
              setIsRenaming(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F2') {
                setRenameValue(group.name)
                setIsRenaming(true)
              }
            }}
            aria-label={`Rename ${group.name}`}
            className="flex-1 truncate rounded text-xs font-medium text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500"
          >
            {group.name}
          </span>
        )}

        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            groupTabs.length > 0
              ? 'bg-zinc-700 text-zinc-300'
              : 'bg-zinc-800 text-zinc-600'
          }`}
        >
          {groupTabs.length}
        </span>

        <button
          onClick={handleAddAgent}
          disabled={!currentFolder}
          aria-label="Add agent to group"
          title={currentFolder ? undefined : 'Select a project folder first'}
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-600"
        >
          <Plus size={13} />
        </button>

        <button
          onClick={() => {
            // Rehome tabs to ungrouped before deleting
            for (const tabId of group.tabIds) {
              removeTabFromGroup(tabId)
            }
            deleteGroup(group.id)
          }}
          aria-label="Delete group"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-red-400 group-hover/header:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Group body */}
      {!group.collapsed && (
        <div
          ref={setNodeRef}
          className={`ml-3 flex flex-col gap-0.5 rounded-md py-0.5 transition-colors ${
            isOver ? 'bg-zinc-800/40' : ''
          } ${groupTabs.length === 0 ? 'min-h-[32px] border border-dashed border-zinc-800' : ''}`}
        >
          <SortableContext items={groupTabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {groupTabs.map((tab) => (
              <DraggableAgentItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSelect={onSelectTab}
                onClose={onCloseTab}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
