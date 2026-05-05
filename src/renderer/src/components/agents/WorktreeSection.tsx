import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Plus, Trash2, GitBranch, Terminal } from 'lucide-react'
import { useTerminalStore, type TerminalTab } from '@renderer/stores/terminal'
import { useWorktreeStore } from '@renderer/stores/worktree'
import { useAgentsStore } from '@renderer/stores/agents'
import { useAppStore } from '@renderer/stores/app'
import { buildAgentCommand } from '@renderer/lib/agent-command-builder'
import { executeSavedCommand } from '@renderer/lib/command-execution'
import { toast } from '@renderer/stores/toast'
import { AgentIcon } from '@renderer/lib/agent-icons'
import DraggableAgentItem from './DraggableAgentItem'
import { getAgentColorIndex } from '@renderer/lib/agent-colors'
import type { WorktreeInfo, SavedCommand } from '@shared/types'

interface WorktreeSectionProps {
  worktree: WorktreeInfo
  projectFolder: string
  tabs: TerminalTab[]
  allProjectTabs: TerminalTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export default function WorktreeSection({
  worktree,
  projectFolder,
  tabs,
  allProjectTabs,
  activeTabId,
  onSelectTab,
  onCloseTab
}: WorktreeSectionProps): React.JSX.Element {
  const collapsed = useWorktreeStore((s) => s.collapsedWorktrees[worktree.path] ?? false)
  const toggleCollapsed = useWorktreeStore((s) => s.toggleWorktreeCollapsed)
  const removeWorktree = useWorktreeStore((s) => s.removeWorktree)
  const createTab = useTerminalStore((s) => s.createTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const showTerminal = useAppStore((s) => s.showTerminal)
  const contentView = useAppStore((s) => s.contentView)

  const isActive =
    contentView.type === 'worktree-detail' && contentView.worktreePath === worktree.path

  const allAgents = useAgentsStore((s) => s.agents)
  const enabledAgents = useMemo(() => allAgents.filter((a) => a.enabled), [allAgents])

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [confirmRemove, setConfirmRemove] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])

  const runningAgents = tabs.filter((t) => !t.exited)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const openAgentMenu = (): void => {
    window.orchestrate
      .listCommands(projectFolder)
      .then(setSavedCommands)
      .catch((err) => {
        console.error('[Worktree] Failed to load saved commands:', err)
        toast.error('Failed to load saved commands')
        setSavedCommands([])
      })
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
        const mcpConfigPath =
          typeof window.orchestrate.getMcpConfigPathForProject === 'function'
            ? await window.orchestrate.getMcpConfigPathForProject(projectFolder).catch(() => null)
            : await window.orchestrate.getMcpConfigPath().catch(() => null)
        const codexMcpFlags =
          typeof window.orchestrate.getCodexMcpFlagsForProject === 'function'
            ? await window.orchestrate.getCodexMcpFlagsForProject(projectFolder).catch(() => null)
            : await window.orchestrate.getCodexMcpFlags().catch(() => null)
        const cmd = buildAgentCommand({
          agent: agentConfig,
          prompt: '',
          mcpConfigPath,
          codexMcpFlags
        })
        tabId = await createTab(
          projectFolder,
          agentConfig.displayName,
          cmd,
          undefined,
          worktree.path
        )
      } else {
        tabId = await createTab(projectFolder, undefined, undefined, undefined, worktree.path)
      }
      setActiveTab(tabId)
      await showTerminal(projectFolder)
    } catch (err) {
      toast.error(`Failed to create terminal: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExecuteSavedCommand = async (commandId: string): Promise<void> => {
    setMenuOpen(false)
    await executeSavedCommand(commandId, projectFolder, worktree.path)
  }

  const handleRemove = async (): Promise<void> => {
    if (runningAgents.length > 0 && !confirmRemove) {
      setConfirmRemove(true)
      return
    }
    try {
      await removeWorktree(projectFolder, worktree.path)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Retry with force for dirty worktrees
      if (msg.includes('contains modified or untracked files') || msg.includes('is dirty')) {
        try {
          await removeWorktree(projectFolder, worktree.path, true)
        } catch (forceErr) {
          toast.error(
            `Failed to remove worktree: ${forceErr instanceof Error ? forceErr.message : String(forceErr)}`
          )
          setConfirmRemove(false)
          return
        }
      } else {
        toast.error(`Failed to remove worktree: ${msg}`)
        setConfirmRemove(false)
        return
      }
    }
    // Only close tabs after successful removal
    for (const tab of tabs) {
      useTerminalStore.getState().closeTab(tab.id)
    }
    // Navigate away if the deleted worktree's detail view is active
    if (isActive) {
      useAppStore.getState().showProjectDetail(projectFolder)
    }
    setConfirmRemove(false)
  }

  return (
    <div className="mt-1">
      {/* Worktree header */}
      <div
        className={`group/wt flex items-center gap-1 rounded-md px-2.5 py-1.5 ${
          isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
        }`}
      >
        <GitBranch size={13} className="flex-shrink-0 text-emerald-500" />

        <button
          onClick={() => useAppStore.getState().showWorktreeDetail(projectFolder, worktree.path)}
          className={`min-w-0 truncate text-left text-sm font-medium ${
            isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title={worktree.path}
        >
          {worktree.branch}
        </button>

        <button
          onClick={() => toggleCollapsed(worktree.path)}
          aria-label={collapsed ? 'Expand worktree' : 'Collapse worktree'}
          className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="flex-1" />

        <span
          className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none ${
            tabs.length > 0 ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-600'
          }`}
        >
          {tabs.length}
        </span>

        <button
          ref={addBtnRef}
          onClick={(e) => {
            e.stopPropagation()
            menuOpen ? setMenuOpen(false) : openAgentMenu()
          }}
          aria-label="Add agent to worktree"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 group-hover/wt:opacity-100 focus-visible:opacity-100"
        >
          <Plus size={13} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleRemove()
          }}
          aria-label="Remove worktree"
          className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-red-400 group-hover/wt:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 size={13} />
        </button>

        {menuOpen &&
          createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="w-44 overflow-hidden rounded-md bg-zinc-800 py-1 shadow-xl"
            >
              {enabledAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleNewAgent(agent.id)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  <AgentIcon agentId={agent.id} className="h-3.5 w-3.5" />
                  <span className="min-w-0 truncate">{agent.displayName}</span>
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

      {/* Confirm remove banner */}
      {confirmRemove && (
        <div className="mx-1.5 mb-1 flex items-center justify-between rounded bg-red-950/40 px-2 py-1.5 text-xs text-red-300">
          <span>
            {runningAgents.length} running agent{runningAgents.length > 1 ? 's' : ''} will be
            terminated
          </span>
          <div className="flex gap-1">
            <button
              onClick={handleRemove}
              className="rounded bg-red-700 px-2 py-0.5 text-white hover:bg-red-600"
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="rounded bg-zinc-700 px-2 py-0.5 hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Worktree agents */}
      {!collapsed && (
        <div className="ml-3 flex flex-col gap-0.5 py-0.5">
          {tabs.map((tab) => (
            <DraggableAgentItem
              key={tab.id}
              tab={tab}
              colorIndex={getAgentColorIndex(tab.id, allProjectTabs)}
              isActive={tab.id === activeTabId}
              onSelect={onSelectTab}
              onClose={onCloseTab}
            />
          ))}
        </div>
      )}
    </div>
  )
}
