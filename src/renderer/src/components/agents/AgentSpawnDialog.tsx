import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GitBranch, Loader2, Play, X } from 'lucide-react'
import { useAgentsStore } from '@renderer/stores/agents'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useWorktreeStore } from '@renderer/stores/worktree'
import { buildAgentCommand } from '@renderer/lib/agent-command-builder'
import { AgentIcon } from '@renderer/lib/agent-icons'
import { toast } from '@renderer/stores/toast'
import DropdownSelect from '@renderer/components/ui/DropdownSelect'
import type { BranchInfo } from '@shared/types'

interface AgentSpawnDialogProps {
  projectFolder: string
  onClose: () => void
}

function agentTrailingIcon(agentId: string): ReactNode {
  return agentId === 'claude-code' || agentId === 'codex' ? (
    <AgentIcon agentId={agentId} />
  ) : undefined
}

export default function AgentSpawnDialog({
  projectFolder,
  onClose
}: AgentSpawnDialogProps): React.JSX.Element {
  const agents = useAgentsStore((s) => s.agents)
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
  const loadWorktrees = useWorktreeStore((s) => s.loadWorktrees)
  const addWorktree = useWorktreeStore((s) => s.addWorktree)

  const [agentId, setAgentId] = useState(() => enabledAgents[0]?.id ?? '')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branch, setBranch] = useState('')
  const [useWorktree, setUseWorktree] = useState(true)
  const [loading, setLoading] = useState(true)
  const [spawning, setSpawning] = useState(false)

  useEffect(() => {
    if (!agentId && enabledAgents[0]) {
      setAgentId(enabledAgents[0].id)
    }
  }, [agentId, enabledAgents])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([window.orchestrate.listBranches(projectFolder), loadWorktrees(projectFolder)])
      .then(([branchList]) => {
        if (!active) return
        setBranches(branchList)
        const current = branchList.find((item) => item.current && !item.isRemote)
        setBranch(current?.name ?? branchList.find((item) => !item.isRemote)?.name ?? '')
      })
      .catch((err) => {
        if (active) {
          toast.error(
            `Failed to load branches: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectFolder, loadWorktrees])

  const localBranches = useMemo(() => branches.filter((item) => !item.isRemote), [branches])
  const selectedAgent = useAgentsStore((s) => s.getAgent(agentId))
  const trimmedBranch = branch.trim()
  const exactBranch = localBranches.find((item) => item.name === trimmedBranch)
  const currentBranch = localBranches.find((item) => item.current)?.name
  const willCreateBranch = Boolean(trimmedBranch && !exactBranch)

  const resolveWorktreePath = async (): Promise<string | undefined> => {
    if (!trimmedBranch) return undefined
    await loadWorktrees(projectFolder)
    let worktrees = useWorktreeStore.getState().worktrees[projectFolder] ?? []
    const existing = worktrees.find((item) => item.branch === trimmedBranch)
    if (existing) {
      return useWorktree ? existing.path : existing.isMain ? undefined : existing.path
    }

    const path = await addWorktree(projectFolder, trimmedBranch)
    await loadWorktrees(projectFolder)
    worktrees = useWorktreeStore.getState().worktrees[projectFolder] ?? []
    return worktrees.find((item) => item.branch === trimmedBranch && !item.isMain)?.path ?? path
  }

  const prepareDirectBranch = async (): Promise<void> => {
    if (!trimmedBranch || trimmedBranch === currentBranch) return
    if (willCreateBranch) {
      await window.orchestrate.createBranch(projectFolder, trimmedBranch)
    } else {
      await window.orchestrate.checkoutBranch(projectFolder, trimmedBranch)
    }
    await loadWorktrees(projectFolder)
  }

  const handleSpawn = async (): Promise<void> => {
    if (!selectedAgent || !trimmedBranch || spawning) return
    setSpawning(true)
    try {
      let worktreePath: string | undefined
      if (useWorktree) {
        worktreePath = await resolveWorktreePath()
      } else {
        await prepareDirectBranch()
      }

      const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
      const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)
      const command = buildAgentCommand({
        agent: selectedAgent,
        prompt: '',
        mcpConfigPath,
        codexMcpFlags
      })

      await useTerminalStore.getState().createTab({
        cwd: projectFolder,
        name: selectedAgent.displayName,
        command,
        kind: 'agent',
        branchName: trimmedBranch,
        launchMode: worktreePath ? 'worktree' : 'direct',
        worktreePath
      })
      onClose()
    } catch (err) {
      toast.error(`Failed to start agent: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSpawning(false)
    }
  }

  return (
    <div className="rounded-lg bg-zinc-900 p-6 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div
          id="agent-spawn-dialog-title"
          className="flex items-center gap-2 text-sm font-medium text-zinc-200"
        >
          <Play size={14} />
          New agent
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Agent</span>
          <DropdownSelect
            ariaLabel="Agent"
            value={agentId}
            variant="field"
            searchPlaceholder="Filter agents..."
            options={enabledAgents.map((agent) => ({
              value: agent.id,
              label: agent.displayName,
              trailingIcon: agentTrailingIcon(agent.id)
            }))}
            onChange={setAgentId}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Branch</span>
          <DropdownSelect
            ariaLabel="Branch"
            value={branch}
            variant="field"
            disabled={loading}
            leadingIcon={<GitBranch size={14} />}
            monospaced
            placeholder={loading ? 'Loading branches...' : 'Select or create branch'}
            searchPlaceholder="Filter or type branch..."
            noOptionsLabel="No branches found"
            allowCustomValue
            customActionLabel={(value) => <>Use branch &ldquo;{value}&rdquo;</>}
            options={localBranches.map((item) => ({
              value: item.name,
              label: item.name,
              icon: <GitBranch size={11} />,
              meta: item.current ? (
                <span className="text-[10px] text-zinc-600">current</span>
              ) : undefined
            }))}
            onChange={setBranch}
          />
          {willCreateBranch && (
            <span className="mt-1 block text-[11px] text-emerald-400">
              Creates branch before spawning
            </span>
          )}
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={useWorktree}
          onClick={() => setUseWorktree((value) => !value)}
          className="flex w-full items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-left"
        >
          <span>
            <span className="block text-sm text-zinc-300">Use worktree</span>
            <span className="block text-xs text-zinc-500">
              {useWorktree
                ? 'Spawn on an isolated branch worktree'
                : 'Checkout and run in the main folder'}
            </span>
          </span>
          <span
            className={`h-5 w-9 rounded-full p-0.5 transition-colors ${useWorktree ? 'bg-white' : 'bg-zinc-700'}`}
          >
            <span
              className={`block h-4 w-4 rounded-full transition-transform ${
                useWorktree ? 'translate-x-4 bg-zinc-950' : 'bg-zinc-500'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={handleSpawn}
          disabled={loading || spawning || !selectedAgent || !trimmedBranch}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-40"
        >
          {spawning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {willCreateBranch ? 'Create branch and spawn' : 'Spawn agent'}
        </button>
      </div>
    </div>
  )
}
