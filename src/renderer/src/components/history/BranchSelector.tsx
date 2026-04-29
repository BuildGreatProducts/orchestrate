import { GitBranch } from 'lucide-react'
import DropdownSelect from '@renderer/components/ui/DropdownSelect'
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
  const localBranches = branches.filter((branch) => !branch.isRemote)
  const options = [
    { value: '__all__', label: 'All branches' },
    ...localBranches.map((branch) => ({
      value: branch.name,
      label: branch.name,
      icon: <GitBranch size={11} />,
      meta: branch.current ? <span className="text-[10px] text-zinc-600">current</span> : undefined
    }))
  ]

  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
      <DropdownSelect
        ariaLabel="Branch"
        value={selectedBranch ?? '__all__'}
        leadingIcon={<GitBranch size={11} />}
        monospaced
        searchPlaceholder="Filter branches..."
        options={options}
        onChange={(value) => onSelect(value === '__all__' ? null : value)}
        className="max-w-[180px]"
      />
    </div>
  )
}
