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
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderPlus,
  Terminal,
  GitBranch,
  Github
} from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import DraggableAgentItem from '@renderer/components/agents/DraggableAgentItem'
import AgentGroupSection from '@renderer/components/agents/AgentGroupSection'
import { getAgentColorIndex } from '@renderer/lib/agent-colors'
import { useAgentsStore } from '@renderer/stores/agents'
import { buildAgentCommand } from '@renderer/lib/agent-command-builder'
import { executeSavedCommand } from '@renderer/lib/command-execution'
import { toast } from '@renderer/stores/toast'
import { AgentIcon } from '@renderer/lib/agent-icons'
import type { SavedCommand } from '@shared/types'
import { useAllProjectsAgentStatus } from '@renderer/hooks/useProjectAgentStatus'
import { AGENT_COLORS, ATTENTION_BG } from '@renderer/lib/agent-colors'
import { useWorktreeStore } from '@renderer/stores/worktree'
import { useBrowserStore } from '@renderer/stores/browser'
import WorktreeSection from '@renderer/components/agents/WorktreeSection'
import AddWorktreeDialog from '@renderer/components/agents/AddWorktreeDialog'
import BranchSwitcher from '@renderer/components/layout/BranchSwitcher'

const EMPTY_WORKTREES: import('@shared/types').WorktreeInfo[] = []

function remoteUrlToHttps(url: string): string {
  // git@github.com:org/repo.git → https://github.com/org/repo
  const sshMatch = url.match(/^[\w-]+@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`
  // ssh://git@github.com/org/repo.git
  const sshProto = url.match(/^ssh:\/\/[\w-]+@([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshProto) return `https://${sshProto[1]}/${sshProto[2]}`
  // https://github.com/org/repo.git → strip .git
  return url.replace(/\.git$/, '')
}

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
  const showPage = useAppStore((s) => s.showPage)
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
  const reorderTabs = useTerminalStore((s) => s.reorderTabs)

  // Filter tabs and groups to this project
  const tabs = useMemo(() => allTabs.filter((t) => t.projectFolder === folder), [allTabs, folder])
  const groups = useMemo(
    () => allGroups.filter((g) => g.projectFolder === folder),
    [allGroups, folder]
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Derive ungrouped tab IDs
  const groupedTabIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) {
      for (const id of g.tabIds) set.add(id)
    }
    return set
  }, [groups])

  const ungroupedTabs = useMemo(
    () => tabs.filter((t) => !groupedTabIds.has(t.id) && !t.worktreePath),
    [tabs, groupedTabIds]
  )
  const ungroupedTabIds = useMemo(() => ungroupedTabs.map((t) => t.id), [ungroupedTabs])

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

  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])

  // Worktree state
  const worktreeList = useWorktreeStore((s) => s.worktrees[folder] ?? EMPTY_WORKTREES)
  const loadWorktrees = useWorktreeStore((s) => s.loadWorktrees)
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [showAddWorktree, setShowAddWorktree] = useState(false)
  const worktreeBtnRef = useRef<HTMLButtonElement>(null)
  const [worktreeDialogStyle, setWorktreeDialogStyle] = useState<CSSProperties>({})

  // Non-main worktrees to display
  const displayWorktrees = useMemo(() => worktreeList.filter((w) => !w.isMain), [worktreeList])

  // Tabs belonging to worktrees vs ungrouped
  const worktreeTabsByPath = useMemo(() => {
    const map = new Map<string, typeof tabs>()
    for (const tab of tabs) {
      if (tab.worktreePath) {
        const existing = map.get(tab.worktreePath) ?? []
        existing.push(tab)
        map.set(tab.worktreePath, existing)
      }
    }
    return map
  }, [tabs])

  // Check git repo and load worktrees on mount/expansion.
  useEffect(() => {
    if (!expanded) return
    let active = true
    loadWorktrees(folder)
      .then(() => {
        return window.orchestrate.isGitRepo(folder)
      })
      .then((repo) => {
        if (active) setIsGitRepo(Boolean(repo))
      })
      .catch(() => {
        if (active) setIsGitRepo(false)
      })
    if (typeof window.orchestrate.getRemoteUrl === 'function') {
      window.orchestrate
        .getRemoteUrl(folder)
        .then((url) => {
          if (active) setRemoteUrl(url)
        })
        .catch(() => {
          if (active) setRemoteUrl(null)
        })
    }
    return () => {
      active = false
    }
  }, [expanded, folder, loadWorktrees])

  const openAgentMenu = (): void => {
    window.orchestrate
      .listCommands(folder)
      .then(setSavedCommands)
      .catch(() => {})
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
        newAgentMenuRef.current &&
        !newAgentMenuRef.current.contains(e.target as Node) &&
        newAgentBtnRef.current &&
        !newAgentBtnRef.current.contains(e.target as Node)
      ) {
        setNewAgentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [newAgentMenuOpen])

  const handleExecuteSavedCommand = async (commandId: string): Promise<void> => {
    setNewAgentMenuOpen(false)
    await executeSavedCommand(commandId, folder)
  }

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
  const dragOriginRef = useRef<{ tabId: string; container: string } | null>(null)

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const tabId = event.active.id as string
      dragOriginRef.current = { tabId, container: findContainer(tabId) }
      setActiveId(tabId)
    },
    [findContainer]
  )

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
      dragOriginRef.current = null
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const dragTabId = active.id as string
      const overId = over.id as string
      if (dragTabId === overId) return

      const container = findContainer(dragTabId)
      if (container === 'ungrouped') {
        const allStoreTabs = useTerminalStore.getState().tabs
        const oldIdx = allStoreTabs.findIndex((t) => t.id === dragTabId)
        const newIdx = allStoreTabs.findIndex((t) => t.id === overId)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderTabs(oldIdx, newIdx)
        }
      } else {
        const group = groups.find((g) => g.id === container)
        if (!group) return
        const oldIdx = group.tabIds.indexOf(dragTabId)
        const newIdx = group.tabIds.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderTabInGroup(container, oldIdx, newIdx)
        }
      }
    },
    [groups, findContainer, reorderTabInGroup, reorderTabs]
  )

  const handleDragCancel = useCallback(() => {
    if (dragOriginRef.current) {
      const { tabId, container } = dragOriginRef.current
      const currentContainer = findContainer(tabId)
      if (currentContainer !== container) {
        if (container === 'ungrouped') {
          removeTabFromGroup(tabId)
        } else {
          moveTabToGroup(tabId, container)
        }
      }
      dragOriginRef.current = null
    }
    setActiveId(null)
  }, [findContainer, moveTabToGroup, removeTabFromGroup])

  const activeTab = activeId ? tabs.find((t) => t.id === activeId) : null

  // Project status dots
  const agentStatusMap = useAllProjectsAgentStatus()
  const status = agentStatusMap.get(folder)

  const projectName = folder.split(/[/\\]/).pop() ?? folder

  const isProjectActive = currentFolder === folder && contentView.type === 'project-detail'

  return (
    <div>
      {/* Project header */}
      <div
        className={`group/project flex items-center gap-1 rounded-md px-1.5 py-1.5 ${
          isProjectActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
        }`}
      >
        <button
          onClick={() => showProjectDetail(folder)}
          className={`flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm font-medium transition-colors ${
            isProjectActive ? 'text-white' : 'text-zinc-300 hover:text-white'
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

        <button
          onClick={() => toggleExpanded(folder)}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
          aria-label={expanded ? 'Collapse project' : 'Expand project'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1" />

        {/* Action buttons — visible on hover */}
        {remoteUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const url = remoteUrlToHttps(remoteUrl)
              showPage('browser')
              useBrowserStore.getState().createTab(url)
            }}
            aria-label="Open remote repo"
            className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/project:opacity-100 focus-visible:opacity-100"
          >
            <Github size={13} />
          </button>
        )}

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

        {isGitRepo && (
          <button
            ref={worktreeBtnRef}
            onClick={(e) => {
              e.stopPropagation()
              if (showAddWorktree) {
                setShowAddWorktree(false)
              } else {
                if (worktreeBtnRef.current) {
                  const rect = worktreeBtnRef.current.getBoundingClientRect()
                  setWorktreeDialogStyle({
                    position: 'fixed',
                    top: rect.bottom + 4,
                    left: rect.left,
                    zIndex: 9999
                  })
                }
                setShowAddWorktree(true)
              }
            }}
            aria-label="New worktree"
            className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-emerald-400 group-hover/project:opacity-100 focus-visible:opacity-100"
          >
            <GitBranch size={13} />
          </button>
        )}

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
              className="w-44 overflow-hidden rounded-md bg-zinc-800 py-1 shadow-xl"
            >
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleNewAgentWithType(agent.id)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  <span className="min-w-0 truncate">{agent.displayName}</span>
                  <AgentIcon agentId={agent.id} className="h-3.5 w-3.5" />
                </button>
              ))}
              {savedCommands.length > 0 && (
                <>
                  <div className="my-1 border-t border-zinc-700" />
                  <div className="px-3 py-1 text-[11px] font-medium text-zinc-500">
                    Saved Commands
                  </div>
                  {savedCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => handleExecuteSavedCommand(cmd.id)}
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      <Terminal size={14} className="mr-2 text-zinc-500" />
                      <span className="truncate">{cmd.name}</span>
                    </button>
                  ))}
                </>
              )}
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
        {showAddWorktree &&
          createPortal(
            <div style={worktreeDialogStyle}>
              <AddWorktreeDialog projectFolder={folder} onClose={() => setShowAddWorktree(false)} />
            </div>,
            document.body
          )}
      </div>

      {/* Branch indicator */}
      {isGitRepo && (
        <div className="pl-1.5 -mt-0.5 mb-0.5">
          <BranchSwitcher projectFolder={folder} />
        </div>
      )}

      {/* Expanded: agent list */}
      {expanded && (
        <div className="pb-1">
          {tabs.length === 0 && groups.length === 0 && displayWorktrees.length === 0 ? (
            <div className="py-2 pl-2.5 text-xs text-zinc-600">No agents</div>
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
                        isActive={tab.id === activeTabId && contentView.type === 'terminal'}
                        onSelect={handleSelectTab}
                        onClose={requestCloseTab}
                      />
                    ))}
                  </SortableContext>
                </UngroupedDropZone>
              )}

              {ungroupedTabs.length === 0 && groupedTabIds.size > 0 && activeId && (
                <UngroupedDropZone>
                  <div className="min-h-[8px]" />
                </UngroupedDropZone>
              )}

              {displayWorktrees.map((wt) => (
                <WorktreeSection
                  key={wt.path}
                  worktree={wt}
                  projectFolder={folder}
                  tabs={worktreeTabsByPath.get(wt.path) ?? []}
                  allProjectTabs={tabs}
                  activeTabId={contentView.type === 'terminal' ? activeTabId : null}
                  onSelectTab={handleSelectTab}
                  onCloseTab={requestCloseTab}
                />
              ))}

              {groups.map((group) => (
                <AgentGroupSection
                  key={group.id}
                  group={group}
                  tabs={tabs}
                  projectFolder={folder}
                  activeTabId={contentView.type === 'terminal' ? activeTabId : null}
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
