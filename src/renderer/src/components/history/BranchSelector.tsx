import type { BranchInfo } from '@shared/types'

export default function BranchSelector({
  branches,
  selectedBranch,
  onSelect
}: {
  branches: BranchInfo[]
  selectedBranch: string | null
  onSelect: (branch: string | null) => void
}): React.JSX.Element {
  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
      <label htmlFor="branch-select" className="text-xs text-zinc-500">
        Branch:
      </label>
      <select
        id="branch-select"
        value={selectedBranch ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 border border-zinc-700 outline-none focus:border-zinc-500"
      >
        <option value="">All branches</option>
        {localBranches.length > 0 && (
          <optgroup label="Local">
            {localBranches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.current ? `* ${b.name}` : b.name}
              </option>
            ))}
          </optgroup>
        )}
        {remoteBranches.length > 0 && (
          <optgroup label="Remote">
            {remoteBranches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}
