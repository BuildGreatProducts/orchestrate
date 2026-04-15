import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const localBranches = branches.filter((b) => !b.isRemote)

  const filtered = search
    ? localBranches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : localBranches

  // Build flat list of selectable values: null ("All branches") + filtered branches
  const items: (string | null)[] = search ? filtered.map((b) => b.name) : [null, ...filtered.map((b) => b.name)]

  const displayLabel = selectedBranch ?? 'All branches'

  const openDropdown = useCallback((): void => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuHeight = 320
      const menuWidth = 224
      const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8))
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      setStyle({ position: 'fixed', top, left, zIndex: 9999 })
    }
    setSearch('')
    setHighlightedIndex(-1)
    setOpen(true)
  }, [])

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

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  const handleSelect = (branch: string | null): void => {
    onSelect(branch)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i < items.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i > 0 ? i - 1 : items.length - 1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < items.length) {
      e.preventDefault()
      handleSelect(items[highlightedIndex])
    }
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openDropdown()
    }
  }

  const optionId = (index: number): string => `branch-option-${index}`

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
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
              onChange={(e) => { setSearch(e.target.value); setHighlightedIndex(-1) }}
              onKeyDown={handleKeyDown}
              placeholder="Filter branches..."
              className="w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-600"
              role="combobox"
              aria-expanded={open}
              aria-controls="branch-listbox"
              aria-activedescendant={highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
            />
          </div>

          {/* Branch list */}
          <div
            ref={listRef}
            id="branch-listbox"
            role="listbox"
            className="max-h-60 overflow-y-auto py-1 dark-scrollbar"
          >
            {items.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">No branches found</div>
            ) : (
              items.map((item, index) => {
                const isSelected = item === selectedBranch
                const isHighlighted = index === highlightedIndex
                const branch = item !== null ? filtered.find((b) => b.name === item) : null

                return (
                  <button
                    key={item ?? '__all__'}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
                      isSelected ? 'text-white' : 'text-zinc-400'
                    } ${isHighlighted ? 'bg-zinc-700' : isSelected ? '' : 'hover:bg-zinc-700'}`}
                  >
                    <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                      {isSelected
                        ? <Check size={12} className="text-emerald-400" />
                        : item !== null ? <GitBranch size={11} className="text-zinc-600" /> : null}
                    </span>
                    <span className="truncate font-mono">{item ?? 'All branches'}</span>
                    {branch?.current && (
                      <span className="ml-auto flex-shrink-0 text-[10px] text-zinc-600">current</span>
                    )}
                  </button>
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
