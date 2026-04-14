import { useState, useRef, useEffect } from 'react'
import { GitBranch } from 'lucide-react'
import { useWorktreeStore } from '@renderer/stores/worktree'

interface AddWorktreeDialogProps {
  projectFolder: string
  onClose: () => void
}

export default function AddWorktreeDialog({
  projectFolder,
  onClose
}: AddWorktreeDialogProps): React.JSX.Element {
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const addWorktree = useWorktreeStore((s) => s.addWorktree)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleSubmit = async (): Promise<void> => {
    const trimmed = branch.trim()
    if (!trimmed) return

    setError(null)
    setCreating(true)
    try {
      await addWorktree(projectFolder, trimmed)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setCreating(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      className="w-64 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
        <GitBranch size={14} className="text-emerald-500" />
        New Worktree
      </div>

      <input
        ref={inputRef}
        type="text"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !creating) handleSubmit()
        }}
        placeholder="feat/my-feature"
        className="mb-1.5 w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-400"
        disabled={creating}
      />

      <p className="mb-2 text-[11px] text-zinc-500">Creates branch if it doesn't exist</p>

      {error && (
        <p className="mb-2 rounded bg-red-950/40 px-2 py-1 text-xs text-red-300">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={creating || !branch.trim()}
        className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-700"
      >
        {creating ? 'Creating...' : 'Create Worktree'}
      </button>
    </div>
  )
}
