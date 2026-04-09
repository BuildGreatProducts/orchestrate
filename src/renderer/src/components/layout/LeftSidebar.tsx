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
import {
  Plus,
  Terminal,
  FolderPlus,
  LayoutList,
  FolderOpen,
  History,
  Globe,
  Puzzle,
  Settings
} from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { NAV_PAGES } from '@shared/types'
import type { NavPageId } from '@shared/types'
import DraggableAgentItem from '@renderer/components/agents/DraggableAgentItem'
import AgentGroupSection from '@renderer/components/agents/AgentGroupSection'
import { AGENT_COLORS } from '@renderer/lib/agent-colors'

const NAV_ICONS: Record<NavPageId, React.ComponentType<{ size?: number }>> = {
  tasks: LayoutList,
  files: FolderOpen,
  skills: Puzzle,
  history: History,
  browser: Globe,
  settings: Settings
}

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

export default function LeftSidebar(): React.JSX.Element {
  const contentView = useAppStore((s) => s.contentView)
  const showPage = useAppStore((s) => s.showPage)
  const showTerminal = useAppStore((s) => s.showTerminal)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const allTabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTerminalTab = useTerminalStore((s) => s.setActiveTab)
  const clearBell = useTerminalStore((s) => s.clearBell)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const allGroups = useTerminalStore((s) => s.groups)
  const createGroup = useTerminalStore((s) => s.createGroup)
  const moveTabToGroup = useTerminalStore((s) => s.moveTabToGroup)
  const removeTabFromGroup = useTerminalStore((s) => s.removeTabFromGroup)
  const reorderTabInGroup = useTerminalStore((s) => s.reorderTabInGroup)

  // Filter tabs and groups to current project
  const tabs = useMemo(
    () => allTabs.filter((t) => t.projectFolder === currentFolder),
    [allTabs, currentFolder]
  )
  const groups = useMemo(
    () => allGroups.filter((g) => g.projectFolder === currentFolder),
    [allGroups, currentFolder]
  )

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
        const tabId = await createTab(currentFolder)
        setActiveTerminalTab(tabId)
        showTerminal()
      } catch (err) {
        console.error('Failed to create terminal:', err)
      }
    }
  }

  const handleSelectTab = (id: string): void => {
    setActiveTerminalTab(id)
    clearBell(id)
    showTerminal()
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const dragTabId = active.id as string
      const overId = over.id as string

      const fromContainer = findContainer(dragTabId)

      let toContainer: string
      let insertIndex: number | undefined

      if (overId === 'ungrouped') {
        toContainer = 'ungrouped'
      } else if (overId.startsWith('group-')) {
        const isGroupContainer = groups.some((g) => g.id === overId)
        if (isGroupContainer) {
          toContainer = overId
        } else {
          toContainer = findContainer(overId)
        }
      } else {
        toContainer = findContainer(overId)
        if (toContainer !== 'ungrouped') {
          const group = groups.find((g) => g.id === toContainer)
          if (group) {
            insertIndex = group.tabIds.indexOf(overId)
          }
        }
      }

      if (fromContainer === toContainer) return

      if (toContainer === 'ungrouped') {
        removeTabFromGroup(dragTabId)
      } else {
        moveTabToGroup(dragTabId, toContainer, insertIndex)
      }
    },
    [groups, findContainer, moveTabToGroup, removeTabFromGroup]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const dragTabId = active.id as string
      const overId = over.id as string

      if (dragTabId === overId) return

      const container = findContainer(dragTabId)

      if (container !== 'ungrouped') {
        const group = groups.find((g) => g.id === container)
        if (!group) return
        const oldIdx = group.tabIds.indexOf(dragTabId)
        const newIdx = group.tabIds.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderTabInGroup(container, oldIdx, newIdx)
        }
      }
    },
    [groups, findContainer, reorderTabInGroup]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const activeTab = activeId ? tabs.find((t) => t.id === activeId) : null

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Navigation links */}
      <div className="flex flex-col gap-0.5 p-1.5">
        {NAV_PAGES.map((page) => {
          const Icon = NAV_ICONS[page.id]
          const isActive = contentView.type === 'page' && contentView.pageId === page.id
          return (
            <button
              key={page.id}
              onClick={() => showPage(page.id)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <Icon size={15} />
              {page.label}
            </button>
          )
        })}
      </div>

      <div className="mx-3 my-1 h-px bg-zinc-800" />

      {/* Agents header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Agents</span>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto dark-scrollbar p-1.5">
        {!currentFolder ? (
          <div className="flex flex-col items-center justify-center gap-2 pt-8 text-center">
            <Terminal size={20} className="text-zinc-600" />
            <span className="text-xs text-zinc-600">Select a project to start</span>
          </div>
        ) : tabs.length === 0 && groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 pt-8 text-center">
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
            {ungroupedTabs.length > 0 && (
              <UngroupedDropZone>
                <SortableContext items={ungroupedTabIds} strategy={verticalListSortingStrategy}>
                  {ungroupedTabs.map((tab) => (
                    <DraggableAgentItem
                      key={tab.id}
                      tab={tab}
                      colorIndex={tabs.findIndex((t) => t.id === tab.id) % AGENT_COLORS.length}
                      isActive={
                        tab.id === activeTabId && contentView.type === 'terminal'
                      }
                      onSelect={handleSelectTab}
                      onClose={closeTab}
                    />
                  ))}
                </SortableContext>
              </UngroupedDropZone>
            )}

            {ungroupedTabs.length === 0 && tabs.length > 0 && (
              <UngroupedDropZone>
                <div className="min-h-[8px]" />
              </UngroupedDropZone>
            )}

            {groups.map((group) => (
              <AgentGroupSection
                key={group.id}
                group={group}
                tabs={tabs}
                activeTabId={
                  contentView.type === 'terminal' ? activeTabId : null
                }
                onSelectTab={handleSelectTab}
                onCloseTab={closeTab}
              />
            ))}

            <DragOverlay>
              {activeId && activeTab ? (
                <DraggableAgentItem
                  tab={activeTab}
                  colorIndex={tabs.findIndex((t) => t.id === activeTab.id) % AGENT_COLORS.length}
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
          onClick={() => currentFolder && createGroup(undefined, currentFolder)}
          disabled={!currentFolder}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <FolderPlus size={14} />
          <span>New group</span>
        </button>
        <button
          onClick={handleNewAgent}
          disabled={!currentFolder}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none"
        >
          <Plus size={14} />
          <span>New agent</span>
        </button>
      </div>
    </div>
  )
}
