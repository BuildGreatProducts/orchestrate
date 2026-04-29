import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface DropdownSelectOption {
  value: string
  label: string
  icon?: ReactNode
  trailingIcon?: ReactNode
  meta?: ReactNode
}

interface DropdownSelectProps {
  value: string
  options: DropdownSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  noOptionsLabel?: string
  monospaced?: boolean
  leadingIcon?: ReactNode
  variant?: 'compact' | 'field'
  showChevron?: boolean
  menuWidth?: number
  allowCustomValue?: boolean
  customActionLabel?: (value: string) => ReactNode
  className?: string
}

export default function DropdownSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  placeholder,
  searchPlaceholder,
  noOptionsLabel = 'No options found',
  monospaced = false,
  leadingIcon,
  variant = 'compact',
  showChevron,
  menuWidth = 224,
  allowCustomValue = false,
  customActionLabel,
  className
}: DropdownSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)
  const filteredOptions = search
    ? options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
    : options
  const trimmedSearch = search.trim()
  const canUseCustomValue =
    allowCustomValue &&
    trimmedSearch.length > 0 &&
    !options.some((option) => option.value === trimmedSearch)
  const displayLabel = (selectedOption?.label ?? value) || placeholder || ''
  const triggerIcon = selectedOption?.icon ?? leadingIcon
  const triggerTrailingIcon = selectedOption?.trailingIcon
  const resolvedShowChevron = showChevron ?? variant === 'field'

  const openDropdown = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuHeight = 320
      const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8))
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
      setStyle({ position: 'fixed', top, left, zIndex: 9999, width: menuWidth })
    }
    setSearch('')
    setOpen(true)
  }, [menuWidth])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent): void => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = (nextValue: string): void => {
    const trimmed = nextValue.trim()
    if (!trimmed) return
    onChange(trimmed)
    setOpen(false)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openDropdown()
    }
  }

  const triggerClassName =
    variant === 'field'
      ? 'flex h-9 w-full min-w-0 items-center gap-2 rounded-md bg-zinc-800/70 px-2 text-sm text-zinc-200 outline-none transition-colors hover:bg-zinc-800 focus:bg-zinc-800 disabled:cursor-default disabled:opacity-45'
      : 'flex h-7 w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent'

  return (
    <div className={cn('min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClassName}
        title={displayLabel}
      >
        {triggerIcon && <span className="shrink-0 text-zinc-500">{triggerIcon}</span>}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            monospaced && 'font-mono',
            !displayLabel && 'text-zinc-600'
          )}
        >
          {displayLabel || placeholder}
        </span>
        {triggerTrailingIcon && (
          <span className="shrink-0 text-zinc-500">{triggerTrailingIcon}</span>
        )}
        {resolvedShowChevron && <ChevronDown size={14} className="shrink-0 text-zinc-500" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={style}
            className="overflow-hidden rounded-md bg-zinc-800 shadow-xl"
          >
            {searchPlaceholder && (
              <div className="border-b border-zinc-700 p-1.5">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canUseCustomValue) {
                      handleSelect(trimmedSearch)
                    }
                    if (event.key === 'Escape') setOpen(false)
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded bg-zinc-900/70 px-2 py-1 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:bg-zinc-900"
                />
              </div>
            )}

            <div role="listbox" className="max-h-60 overflow-y-auto py-1 dark-scrollbar">
              {filteredOptions.length === 0 && !canUseCustomValue ? (
                <div className="px-3 py-2 text-xs text-zinc-500">{noOptionsLabel}</div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = option.value === value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs',
                        isSelected ? 'text-white' : 'text-zinc-400 hover:bg-zinc-700'
                      )}
                    >
                      <span className="flex w-3.5 shrink-0 items-center justify-center">
                        {isSelected ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          option.icon && <span className="text-zinc-600">{option.icon}</span>
                        )}
                      </span>
                      {isSelected && option.icon && (
                        <span className="shrink-0 text-zinc-500">{option.icon}</span>
                      )}
                      <span className={cn('min-w-0 flex-1 truncate', monospaced && 'font-mono')}>
                        {option.label}
                      </span>
                      {option.trailingIcon && (
                        <span className="shrink-0 text-zinc-500">{option.trailingIcon}</span>
                      )}
                      {option.meta && <span className="shrink-0">{option.meta}</span>}
                    </button>
                  )
                })
              )}
            </div>

            {canUseCustomValue && (
              <>
                <div className="border-t border-zinc-700" />
                <button
                  type="button"
                  onClick={() => handleSelect(trimmedSearch)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-emerald-400 hover:bg-zinc-700"
                >
                  <Plus size={12} />
                  {customActionLabel ? customActionLabel(trimmedSearch) : trimmedSearch}
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
