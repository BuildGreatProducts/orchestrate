import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronRight, ChevronDown, Plus, Trash2, Terminal, Folder } from 'lucide-react'
import { useTerminalStore, type AgentGroup, type TerminalTab } from '@renderer/stores/terminal'
import { useAgentsStore } from '@renderer/stores/agents'
import { useAppStore } from '@renderer/stores/app'
import { buildAgentCommand } from '@renderer/lib/agent-command-builder'
import { executeSavedCommand } from '@renderer/lib/command-execution'
import { toast } from '@renderer/stores/toast'
import DraggableAgentItem from './DraggableAgentItem'
import { getAgentColorIndex } from '@renderer/lib/agent-colors'
import type { SavedCommand } from '@shared/types'

interface AgentGroupSectionProps {
  group: AgentGroup
  tabs: TerminalTab[]
  activeTabId: string | null
  projectFolder: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export default function AgentGroupSection({
  group,
  tabs,
  activeTabId,
  projectFolder,
  onSelectTab,
  onCloseTab
}: AgentGroupSectionProps): React.JSX.Element {
  const renameGroup = useTerminalStore((s) => s.renameGroup)
  const toggleGroupCollapsed = useTerminalStore((s) => s.toggleGroupCollapsed)
  const deleteGroup = useTerminalStore((s) => s.deleteGroup)
  const removeTabFromGroup = useTerminalStore((s) => s.removeTabFromGroup)
  const createTabInGroup = useTerminalStore((s) => s.createTabInGroup)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const showTerminal = useAppStore((s) => s.showTerminal)

  const allAgents = useAgentsStore((s) => s.agents)
  const enabledAgents = useMemo(() => allAgents.filter((a) => a.enabled), [allAgents])

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])

  const { isOver, setNodeRef } = useDroppable({ id: group.id })

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming])

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        addBtnRef.current && !addBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const commitRename = (): void => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== group.name) {
      renameGroup(group.id, trimmed)
    }
    setIsRenaming(false)
  }

  const openAgentMenu = (): void => {
    window.orchestrate.listCommands(projectFolder).then(setSavedCommands).catch(() => {})
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect()
      setMenuStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999 })
    }
    setMenuOpen(true)
  }

  const handleNewAgent = async (agentId?: string): Promise<void> => {
    setMenuOpen(false)
    try {
      let tabId: string
      if (agentId) {
        const agentConfig = useAgentsStore.getState().getAgent(agentId)
        if (!agentConfig) return
        const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
        const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
        const cmd = buildAgentCommand({ agent: agentConfig, prompt: '', mcpConfigPath, codexMcpFlags })
        tabId = await createTabInGroup(projectFolder, group.id, agentConfig.displayName, cmd)
      } else {
        tabId = await createTabInGroup(projectFolder, group.id)
      }
      setActiveTab(tabId)
      await showTerminal(projectFolder)
    } catch (err) {
      toast.error(`Failed to create terminal: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExecuteSavedCommand = async (commandId: string): Promise<void> => {
    setMenuOpen(false)
    await executeSavedCommand(commandId, projectFolder)
  }

  // Filter tabs to only those in this group, preserving group order
  const tabById = new Map(tabs.map((t) => [t.id, t]))
  const groupTabs = group.tabIds
    .map((id) => tabById.get(id))
    .filter((t): t is TerminalTab => t !== undefined)

  return (
    <div className="mt-1">
      {/* Group header */}
      <div className="group/header flex items-center gap-1 rounded-md px-2.5 py-1.5 hover:bg-zinc-800/50">
        <Folder size={13} className="flex-shrink-0 text-purple-500" />

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
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-sm font-medium text-zinc-200 outline-none focus:border-zinc-400"
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
            className="min-w-0 truncate rounded text-sm font-medium text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500"
          >
            {group.name}
          </span>
        )}

        <button
          onClick={() => toggleGroupCollapsed(group.id)}
          aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
        >
          {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="flex-1" />

        <span
          className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none ${
            groupTabs.length > 0
              ? 'bg-zinc-700 text-zinc-300'
              : 'bg-zinc-800 text-zinc-600'
          }`}
        >
          {groupTabs.length}
        </span>

        <button
          ref={addBtnRef}
          onClick={(e) => {
            e.stopPropagation()
            menuOpen ? setMenuOpen(false) : openAgentMenu()
          }}
          aria-label="Add agent to group"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/header:opacity-100 focus-visible:opacity-100"
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

        {menuOpen &&
          createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="w-44 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
            >
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleNewAgent(agent.id)}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  {agent.displayName}
                </button>
              ))}
              {savedCommands.length > 0 && (
                <>
                  <div className="my-1 border-t border-zinc-700" />
                  <div className="px-3 py-1 text-[11px] font-medium text-zinc-500">Saved Commands</div>
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
                onClick={() => handleNewAgent()}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
              >
                <Terminal size={14} className="mr-2" />
                Plain Terminal
              </button>
            </div>,
            document.body
          )}
      </div>

      {/* Group body */}
      {!group.collapsed && (
        <div
          ref={setNodeRef}
          className={`ml-3 flex flex-col gap-0.5 rounded-md py-0.5 transition-colors ${
            isOver ? 'bg-zinc-800/40' : ''
          }`}
        >
          <SortableContext items={groupTabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {groupTabs.map((tab) => (
              <DraggableAgentItem
                key={tab.id}
                tab={tab}
                colorIndex={getAgentColorIndex(tab.id, tabs)}
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
