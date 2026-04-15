import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, Check, ChevronDown } from 'lucide-react'
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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [style, setStyle] = useState<CSSProperties>({})

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const localBranches = branches.filter((b) => !b.isRemote)

  const filtered = search
    ? localBranches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : localBranches

  const displayLabel = selectedBranch ?? 'All branches'

  const openDropdown = (): void => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuHeight = 320
      const menuWidth = 224
      const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8))
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      setStyle({ position: 'fixed', top, left, zIndex: 9999 })
    }
    setSearch('')
    setOpen(true)
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

  const handleSelect = (branch: string | null): void => {
    onSelect(branch)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
        title={`Branch: ${displayLabel}`}
      >
        <GitBranch size={11} />
        <span className="truncate max-w-[140px] font-mono">{displayLabel}</span>
        <ChevronDown size={10} className="ml-0.5 flex-shrink-0" />
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
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="Filter branches..."
              className="w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          {/* Branch list */}
          <div className="max-h-60 overflow-y-auto py-1 dark-scrollbar">
            {/* All branches option - only show when not searching */}
            {!search && (
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 ${
                  selectedBranch === null ? 'text-white' : 'text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                <button
                  onClick={() => handleSelect(null)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                >
                  <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                    {selectedBranch === null && <Check size={12} className="text-emerald-400" />}
                  </span>
                  <span className="truncate">All branches</span>
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">No branches found</div>
            ) : (
              filtered.map((branch) => {
                const isSelected = branch.name === selectedBranch
                return (
                  <div
                    key={branch.name}
                    className={`flex items-center gap-2 px-2.5 py-1.5 ${
                      isSelected ? 'text-white' : 'text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(branch.name)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                    >
                      <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                        {isSelected
                          ? <Check size={12} className="text-emerald-400" />
                          : <GitBranch size={11} className="text-zinc-600" />}
                      </span>
                      <span className="truncate font-mono">{branch.name}</span>
                      {branch.current && (
                        <span className="ml-auto flex-shrink-0 text-[10px] text-zinc-600">current</span>
                      )}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
