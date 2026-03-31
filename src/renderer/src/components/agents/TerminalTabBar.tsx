import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Terminal, FolderPlus } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import DraggableAgentItem from './DraggableAgentItem'
import AgentGroupSection from './AgentGroupSection'

function UngroupedDropZone({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: 'ungrouped' })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-0.5 rounded-md transition-colors ${isOver ? 'bg-zinc-800/40' : ''}`}
    >
      {children}
    </div>
  )
}

export default function TerminalTabBar(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const clearBell = useTerminalStore((s) => s.clearBell)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const groups = useTerminalStore((s) => s.groups)
  const createGroup = useTerminalStore((s) => s.createGroup)
  const moveTabToGroup = useTerminalStore((s) => s.moveTabToGroup)
  const removeTabFromGroup = useTerminalStore((s) => s.removeTabFromGroup)
  const reorderTabInGroup = useTerminalStore((s) => s.reorderTabInGroup)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Derive ungrouped tab IDs
  const groupedTabIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) {
      for (const id of g.tabIds) set.add(id)
    }
    return set
  }, [groups])

  const ungroupedTabs = useMemo(
    () => tabs.filter((t) => !groupedTabIds.has(t.id)),
    [tabs, groupedTabIds]
  )
  const ungroupedTabIds = useMemo(
    () => ungroupedTabs.map((t) => t.id),
    [ungroupedTabs]
  )

  // Find which container (group id or 'ungrouped') a tab belongs to
  const findContainer = useCallback(
    (tabId: string): string => {
      for (const g of groups) {
        if (g.tabIds.includes(tabId)) return g.id
      }
      return 'ungrouped'
    },
    [groups]
  )

  const handleNewAgent = async (): Promise<void> => {
    if (currentFolder) {
      try {
        await createTab(currentFolder)
      } catch (err) {
        console.error('Failed to create terminal:', err)
      }
    }
  }

  const handleSelectTab = (id: string): void => {
    setActiveTab(id)
    clearBell(id)
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const activeTabId = active.id as string
      const overId = over.id as string

      // Determine source container
      const fromContainer = findContainer(activeTabId)

      // Determine target container
      let toContainer: string
      let insertIndex: number | undefined

      if (overId === 'ungrouped') {
        toContainer = 'ungrouped'
      } else if (overId.startsWith('group-')) {
        // Could be a group container itself
        const isGroupContainer = groups.some((g) => g.id === overId)
        if (isGroupContainer) {
          toContainer = overId
        } else {
          toContainer = findContainer(overId)
        }
      } else {
        // It's a tab — find its container
        toContainer = findContainer(overId)
        // Find the index of the over tab in its container
        if (toContainer !== 'ungrouped') {
          const group = groups.find((g) => g.id === toContainer)
          if (group) {
            insertIndex = group.tabIds.indexOf(overId)
          }
        }
      }

      if (fromContainer === toContainer) return

      // Cross-container move
      if (toContainer === 'ungrouped') {
        removeTabFromGroup(activeTabId)
      } else {
        moveTabToGroup(activeTabId, toContainer, insertIndex)
      }
    },
    [groups, findContainer, moveTabToGroup, removeTabFromGroup]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeTabId = active.id as string
      const overId = over.id as string

      if (activeTabId === overId) return

      const container = findContainer(activeTabId)

      // Within-group reorder
      if (container !== 'ungrouped') {
        const group = groups.find((g) => g.id === container)
        if (!group) return
        const oldIdx = group.tabIds.indexOf(activeTabId)
        const newIdx = group.tabIds.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderTabInGroup(container, oldIdx, newIdx)
        }
      }
      // Ungrouped tabs don't have a persisted order to reorder
    },
    [groups, findContainer, reorderTabInGroup]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const activeTab = activeId ? tabs.find((t) => t.id === activeId) : null

  return (
    <div className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900">
      <div className="flex h-full w-64 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Agents
          </span>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto dark-scrollbar p-1.5">
          {tabs.length === 0 && groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 pt-12 text-center">
              <Terminal size={20} className="text-zinc-600" />
              <span className="text-xs text-zinc-600">No agents yet</span>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {/* Ungrouped agents */}
              {ungroupedTabs.length > 0 && (
                <UngroupedDropZone>
                  <SortableContext items={ungroupedTabIds} strategy={verticalListSortingStrategy}>
                    {ungroupedTabs.map((tab) => (
                      <DraggableAgentItem
                        key={tab.id}
                        tab={tab}
                        isActive={tab.id === activeTabId}
                        onSelect={handleSelectTab}
                        onClose={closeTab}
                      />
                    ))}
                  </SortableContext>
                </UngroupedDropZone>
              )}

              {/* Empty ungrouped drop zone when all tabs are grouped */}
              {ungroupedTabs.length === 0 && tabs.length > 0 && (
                <UngroupedDropZone>
                  <div className="min-h-[8px]" />
                </UngroupedDropZone>
              )}

              {/* Groups */}
              {groups.map((group) => (
                <AgentGroupSection
                  key={group.id}
                  group={group}
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onSelectTab={handleSelectTab}
                  onCloseTab={closeTab}
                />
              ))}

              <DragOverlay>
                {activeId && activeTab ? (
                  <DraggableAgentItem
                    tab={activeTab}
                    isActive={false}
                    onSelect={() => {}}
                    onClose={() => {}}
                    isDragOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Bottom buttons */}
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          <button
            onClick={() => createGroup()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
          >
            <FolderPlus size={14} />
            <span>New group</span>
          </button>
          <button
            onClick={handleNewAgent}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
          >
            <Plus size={14} />
            <span>New agent</span>
          </button>
        </div>
      </div>
    </div>
  )
}
