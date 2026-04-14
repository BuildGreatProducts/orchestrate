import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, Check, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { useWorktreeStore } from '@renderer/stores/worktree'
import { useTerminalStore } from '@renderer/stores/terminal'
import { toast } from '@renderer/stores/toast'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'
import type { BranchInfo } from '@shared/types'

interface BranchSwitcherProps {
  projectFolder: string
}

export default function BranchSwitcher({ projectFolder }: BranchSwitcherProps): React.JSX.Element | null {
  const mainWorktree = useWorktreeStore((s) => s.worktrees[projectFolder]?.[0])
  const loadWorktrees = useWorktreeStore((s) => s.loadWorktrees)
  const currentBranch = mainWorktree?.branch ?? ''

  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [forceDelete, setForceDelete] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<CSSProperties>({})

  const runningAgentCount = useTerminalStore((s) =>
    s.tabs.filter((t) => t.projectFolder === projectFolder && !t.exitCode && t.exitCode !== 0).length
  )

  const loadBranches = useCallback(async () => {
    setLoading(true)
    try {
      const branchList = await window.orchestrate.listBranches(projectFolder)
      setBranches(branchList)
      setHasChanges(false)
      const dirty = await window.orchestrate.hasUncommittedChanges().catch(() => false)
      setHasChanges(dirty)
    } catch {
      setBranches([])
      setHasChanges(false)
    } finally {
      setLoading(false)
    }
  }, [projectFolder])

  const openDropdown = (): void => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuHeight = 320
      const menuWidth = 224 // w-56
      const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8))
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      setStyle({ position: 'fixed', top, left, zIndex: 9999 })
    }
    setSearch('')
    setPendingDelete(null)
    setForceDelete(false)
    setOpen(true)
    loadBranches()
  }

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent): void => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const localBranches = branches.filter((b) => !b.isRemote)
  const filtered = search
    ? localBranches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : localBranches

  const exactMatch = localBranches.some((b) => b.name === search)
  const canCreate = search.length > 0 && !exactMatch

  const handleCheckout = async (branch: string): Promise<void> => {
    if (branch === currentBranch) return
    try {
      await window.orchestrate.checkoutBranch(projectFolder, branch)
      await loadWorktrees(projectFolder)
      setOpen(false)
      toast.success(`Switched to ${branch}`)
    } catch (err) {
      toast.error(`Checkout failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!search) return
    try {
      await window.orchestrate.createBranch(projectFolder, search)
      await loadWorktrees(projectFolder)
      setOpen(false)
      toast.success(`Created and switched to ${search}`)
    } catch (err) {
      toast.error(`Create failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDeleteConfirmed = async (): Promise<void> => {
    if (!pendingDelete) return
    const branch = pendingDelete
    try {
      await window.orchestrate.deleteBranch(projectFolder, branch, forceDelete)
      setPendingDelete(null)
      setForceDelete(false)
      await loadBranches()
      toast.success(`Deleted branch ${branch}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('not fully merged') && !forceDelete) {
        setForceDelete(true)
      } else {
        setPendingDelete(null)
        setForceDelete(false)
        toast.error(`Delete failed: ${msg}`)
      }
    }
  }

  if (!currentBranch) return null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
        title={`Branch: ${currentBranch}`}
      >
        <GitBranch size={11} />
        <span className="truncate max-w-[140px] font-mono">{currentBranch}</span>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={style}
          className="w-56 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 shadow-xl"
        >
          {/* Search / filter */}
          <div className="border-b border-zinc-700 p-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate()
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="Filter or create branch..."
              className="w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          {/* Warnings */}
          {hasChanges && (
            <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-400">
              <AlertTriangle size={12} />
              Uncommitted changes
            </div>
          )}
          {runningAgentCount > 0 && (
            <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-400">
              <AlertTriangle size={12} />
              {runningAgentCount} running agent{runningAgentCount > 1 ? 's' : ''} may be affected
            </div>
          )}

          {/* Branch list */}
          <div className="max-h-60 overflow-y-auto py-1 dark-scrollbar">
            {loading ? (
              <div className="px-3 py-2 text-xs text-zinc-500">Loading...</div>
            ) : filtered.length === 0 && !canCreate ? (
              <div className="px-3 py-2 text-xs text-zinc-500">No branches found</div>
            ) : (
              filtered.map((branch) => {
                const isCurrent = branch.name === currentBranch
                return (
                  <div
                    key={branch.name}
                    className={`group/branch flex items-center gap-2 px-2.5 py-1.5 ${
                      isCurrent ? 'text-white' : 'text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    <button
                      onClick={() => handleCheckout(branch.name)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                    >
                      <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                        {isCurrent
                          ? <Check size={12} className="text-emerald-400" />
                          : <GitBranch size={11} className="text-zinc-600" />}
                      </span>
                      <span className="truncate font-mono">{branch.name}</span>
                    </button>
                    {!isCurrent && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(branch.name); setForceDelete(false) }}
                        className="flex-shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover/branch:opacity-100"
                        title={`Delete ${branch.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Create branch */}
          {canCreate && (
            <>
              <div className="border-t border-zinc-700" />
              <button
                onClick={handleCreate}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-emerald-400 hover:bg-zinc-700"
              >
                <Plus size={12} />
                Create branch &ldquo;{search}&rdquo;
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={forceDelete ? 'Force delete branch?' : 'Delete branch?'}
          description={
            forceDelete
              ? `"${pendingDelete}" is not fully merged. Force deleting may result in lost commits.`
              : `Are you sure you want to delete the branch "${pendingDelete}"?`
          }
          confirmLabel={forceDelete ? 'Force Delete' : 'Delete'}
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => { setPendingDelete(null); setForceDelete(false) }}
        />
      )}
    </>
  )
}
