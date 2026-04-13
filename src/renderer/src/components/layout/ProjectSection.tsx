import { useState, useCallback, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
import { ChevronRight, ChevronDown, Plus, FolderPlus, Terminal } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import DraggableAgentItem from '@renderer/components/agents/DraggableAgentItem'
import AgentGroupSection from '@renderer/components/agents/AgentGroupSection'
import { getAgentColorIndex } from '@renderer/lib/agent-colors'
import { useAgentsStore } from '@renderer/stores/agents'
import { buildAgentCommand } from '@renderer/lib/agent-command-builder'
import { toast } from '@renderer/stores/toast'
import { useAllProjectsAgentStatus } from '@renderer/hooks/useProjectAgentStatus'
import { AGENT_COLORS, ATTENTION_BG } from '@renderer/lib/agent-colors'

function UngroupedDropZone({ children }: { children: React.ReactNode }): React.JSX.Element {
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

interface ProjectSectionProps {
  folder: string
}

export default function ProjectSection({ folder }: ProjectSectionProps): React.JSX.Element {
  const expanded = useAppStore((s) => s.expandedProjects[folder] ?? true)
  const toggleExpanded = useAppStore((s) => s.toggleProjectExpanded)
  const showProjectDetail = useAppStore((s) => s.showProjectDetail)
  const showTerminal = useAppStore((s) => s.showTerminal)
  const contentView = useAppStore((s) => s.contentView)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const allTabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTerminalTab = useTerminalStore((s) => s.setActiveTab)
  const requestCloseTab = useTerminalStore((s) => s.requestCloseTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const allGroups = useTerminalStore((s) => s.groups)
  const createGroup = useTerminalStore((s) => s.createGroup)
  const moveTabToGroup = useTerminalStore((s) => s.moveTabToGroup)
  const removeTabFromGroup = useTerminalStore((s) => s.removeTabFromGroup)
  const reorderTabInGroup = useTerminalStore((s) => s.reorderTabInGroup)

  // Filter tabs and groups to this project
  const tabs = useMemo(
    () => allTabs.filter((t) => t.projectFolder === folder),
    [allTabs, folder]
  )
  const groups = useMemo(
    () => allGroups.filter((g) => g.projectFolder === folder),
    [allGroups, folder]
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

  // New agent menu
  const allAgents = useAgentsStore((s) => s.agents)
  const enabledAgents = useMemo(() => allAgents.filter((a) => a.enabled), [allAgents])
  const [newAgentMenuOpen, setNewAgentMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const newAgentBtnRef = useRef<HTMLButtonElement>(null)
  const newAgentMenuRef = useRef<HTMLDivElement>(null)

  const openAgentMenu = (): void => {
    if (newAgentBtnRef.current) {
      const rect = newAgentBtnRef.current.getBoundingClientRect()
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999
      })
    }
    setNewAgentMenuOpen(true)
  }

  useEffect(() => {
    if (!newAgentMenuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (
        newAgentMenuRef.current && !newAgentMenuRef.current.contains(e.target as Node) &&
        newAgentBtnRef.current && !newAgentBtnRef.current.contains(e.target as Node)
      ) {
        setNewAgentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [newAgentMenuOpen])

  const handleNewAgentWithType = async (agentId?: string): Promise<void> => {
    setNewAgentMenuOpen(false)
    try {
      let tabId: string
      if (agentId) {
        const agentConfig = useAgentsStore.getState().getAgent(agentId)
        if (!agentConfig) return
        const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
        const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
        const cmd = buildAgentCommand({
          agent: agentConfig,
          prompt: '',
          mcpConfigPath,
          codexMcpFlags
        })
        tabId = await createTab(folder, agentConfig.displayName, cmd)
      } else {
        tabId = await createTab(folder)
      }
      setActiveTerminalTab(tabId)
      await showTerminal(folder)
    } catch (err) {
      toast.error(`Failed to create terminal: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSelectTab = (id: string): void => {
    setActiveTerminalTab(id)
    showTerminal(folder)
  }

  // DnD handlers
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

  // Project status dots
  const agentStatusMap = useAllProjectsAgentStatus()
  const status = agentStatusMap.get(folder)

  const projectName = folder.split(/[/\\]/).pop() ?? folder

  const isProjectActive =
    currentFolder === folder && contentView.type === 'project-detail'

  return (
    <div>
      {/* Project header */}
      <div className={`group/project flex items-center gap-1 rounded-md px-1.5 py-1.5 ${
        isProjectActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
      }`}>
        <button
          onClick={() => toggleExpanded(folder)}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
          aria-label={expanded ? 'Collapse project' : 'Expand project'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <button
          onClick={() => showProjectDetail(folder)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm font-medium transition-colors ${
            isProjectActive
              ? 'text-white'
              : 'text-zinc-300 hover:text-white'
          }`}
          title={folder}
        >
          {/* Status dots */}
          {status?.dots && status.dots.length > 0 && (
            <span className="flex items-center gap-0.5">
              {status.dots.slice(0, 3).map((dot) => (
                <span
                  key={dot.tabId}
                  className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    dot.status === 'attention'
                      ? `${ATTENTION_BG} ring-1 ring-amber-500/40`
                      : AGENT_COLORS[dot.colorIndex].bg
                  }`}
                />
              ))}
            </span>
          )}
          <span className="truncate">{projectName}</span>
        </button>

        {/* Action buttons — visible on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            createGroup(undefined, folder)
          }}
          aria-label="New group"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/project:opacity-100 focus-visible:opacity-100"
        >
          <FolderPlus size={13} />
        </button>

        <button
          ref={newAgentBtnRef}
          onClick={(e) => {
            e.stopPropagation()
            if (newAgentMenuOpen) {
              setNewAgentMenuOpen(false)
            } else {
              openAgentMenu()
            }
          }}
          aria-label="New agent"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/project:opacity-100 focus-visible:opacity-100"
        >
          <Plus size={13} />
        </button>
        {newAgentMenuOpen &&
          createPortal(
            <div
              ref={newAgentMenuRef}
              style={menuStyle}
              className="w-44 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
            >
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleNewAgentWithType(agent.id)}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  {agent.displayName}
                </button>
              ))}
              <div className="my-1 border-t border-zinc-700" />
              <button
                onClick={() => handleNewAgentWithType()}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
              >
                <Terminal size={14} className="mr-2" />
                Plain Terminal
              </button>
            </div>,
            document.body
          )}
      </div>

      {/* Expanded: agent list */}
      {expanded && (
        <div className="ml-3 pb-1">
          {tabs.length === 0 && groups.length === 0 ? (
            <div className="py-2 pl-3 text-xs text-zinc-600">No agents</div>
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
                        colorIndex={getAgentColorIndex(tab.id, tabs)}
                        isActive={
                          tab.id === activeTabId && contentView.type === 'terminal'
                        }
                        onSelect={handleSelectTab}
                        onClose={requestCloseTab}
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
                  projectFolder={folder}
                  activeTabId={
                    contentView.type === 'terminal' ? activeTabId : null
                  }
                  onSelectTab={handleSelectTab}
                  onCloseTab={requestCloseTab}
                />
              ))}

              <DragOverlay>
                {activeId && activeTab ? (
                  <DraggableAgentItem
                    tab={activeTab}
                    colorIndex={getAgentColorIndex(activeTab.id, tabs)}
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
      )}
    </div>
  )
}
