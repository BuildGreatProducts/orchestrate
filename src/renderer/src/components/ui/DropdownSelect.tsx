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
  inlineIcon?: ReactNode
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
  const listboxRef = useRef<HTMLDivElement>(null)
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
  const triggerInlineIcon = selectedOption?.inlineIcon
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

  const closeDropdown = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      if (searchPlaceholder) {
        searchRef.current?.focus()
        return
      }
      const firstOption = listboxRef.current?.querySelector<HTMLElement>('[role="option"]')
      if (firstOption) {
        firstOption.focus()
      } else {
        listboxRef.current?.focus()
      }
    })
  }, [open, searchPlaceholder])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent): void => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [closeDropdown, open])

  const handleSelect = (nextValue: string): void => {
    const isPredefinedValue = options.some((option) => option.value === nextValue)
    const resolvedValue = isPredefinedValue ? nextValue : nextValue.trim()
    if (!isPredefinedValue && !resolvedValue) return
    onChange(resolvedValue)
    closeDropdown()
  }

  const handleDropdownKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeDropdown()
      return
    }

    const target = event.target as HTMLElement | null
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable
    ) {
      return
    }

    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }

    const optionElements = Array.from(
      listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []
    )
    if (optionElements.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    const currentIndex = optionElements.findIndex((option) => option === document.activeElement)
    let nextIndex = currentIndex
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = optionElements.length - 1
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % optionElements.length
    } else if (event.key === 'ArrowUp') {
      nextIndex =
        currentIndex <= 0 ? optionElements.length - 1 : (currentIndex - 1) % optionElements.length
    }

    optionElements[nextIndex]?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (open) closeDropdown()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        event.preventDefault()
        openDropdown()
      }
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
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClassName}
        title={displayLabel}
      >
        {triggerIcon && <span className="shrink-0 text-zinc-500">{triggerIcon}</span>}
        <span
          className={cn(
            'min-w-0 flex-1 items-center gap-1.5 text-left',
            triggerInlineIcon ? 'inline-flex' : 'block truncate',
            monospaced && 'font-mono',
            !displayLabel && 'text-zinc-600'
          )}
        >
          <span className="min-w-0 truncate">{displayLabel || placeholder}</span>
          {triggerInlineIcon && <span className="shrink-0 text-zinc-500">{triggerInlineIcon}</span>}
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
            onKeyDown={handleDropdownKeyDown}
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
                      event.preventDefault()
                      event.stopPropagation()
                      handleSelect(trimmedSearch)
                      return
                    }
                    handleDropdownKeyDown(event)
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded bg-zinc-900/70 px-2 py-1 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:bg-zinc-900"
                />
              </div>
            )}

            <div
              ref={listboxRef}
              role="listbox"
              tabIndex={-1}
              className="max-h-60 overflow-y-auto py-1 dark-scrollbar"
            >
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
                      <span
                        className={cn(
                          'min-w-0 flex-1 items-center gap-1.5',
                          option.inlineIcon ? 'inline-flex' : 'block truncate',
                          monospaced && 'font-mono'
                        )}
                      >
                        <span className="min-w-0 truncate">{option.label}</span>
                        {option.inlineIcon && (
                          <span className="shrink-0 text-zinc-500">{option.inlineIcon}</span>
                        )}
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
