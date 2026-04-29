import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { executeSavedCommand } from '@renderer/lib/command-execution'
import { useAppStore } from '@renderer/stores/app'
import { useTerminalStore } from '@renderer/stores/terminal'
import type { SavedCommand } from '@shared/types'
import TerminalPane from './TerminalPane'

interface BottomTerminalPanelProps {
  projectFolder: string
}

export default function BottomTerminalPanel({
  projectFolder
}: BottomTerminalPanelProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const createTab = useTerminalStore((s) => s.createTab)
  const requestCloseTab = useTerminalStore((s) => s.requestCloseTab)
  const bottomTerminalOpen = useAppStore((s) => s.bottomTerminalOpen)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const terminalTabs = useMemo(
    () => tabs.filter((tab) => tab.projectFolder === projectFolder && tab.kind !== 'agent'),
    [tabs, projectFolder]
  )

  const visibleActiveTabId = terminalTabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : (terminalTabs[0]?.id ?? null)

  useEffect(() => {
    if (!menuOpen || !bottomTerminalOpen) return

    const handleClick = (event: MouseEvent): void => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        addButtonRef.current &&
        !addButtonRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, bottomTerminalOpen])

  useEffect(() => {
    if (bottomTerminalOpen || !menuOpen) return

    const frame = requestAnimationFrame(() => {
      setMenuOpen(false)
    })

    return () => cancelAnimationFrame(frame)
  }, [bottomTerminalOpen, menuOpen])

  const handleCreatePlainTerminal = async (): Promise<void> => {
    setMenuOpen(false)
    const id = await createTab({ cwd: projectFolder, kind: 'terminal' })
    setActiveTab(id)
  }

  const handleExecuteSavedCommand = async (commandId: string): Promise<void> => {
    setMenuOpen(false)
    await executeSavedCommand(commandId, projectFolder)
  }

  const openNewTerminalMenu = async (): Promise<void> => {
    try {
      const commands = await window.orchestrate.listCommands(projectFolder)
      if (commands.length === 0) {
        await handleCreatePlainTerminal()
        return
      }

      setSavedCommands(commands)
      if (addButtonRef.current) {
        const rect = addButtonRef.current.getBoundingClientRect()
        const menuWidth = 192 // w-48
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
        setMenuStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left,
          zIndex: 9999
        })
      }
      setMenuOpen(true)
    } catch {
      await handleCreatePlainTerminal()
    }
  }

  return (
    <section className="flex h-72 w-full shrink-0 flex-col border-t-2 border-zinc-900 bg-black">
      <div className="flex h-10 items-center px-3">
        <div
          role="tablist"
          aria-orientation="horizontal"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto dark-scrollbar"
        >
          {terminalTabs.map((tab) => {
            const active = tab.id === visibleActiveTabId
            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setActiveTab(tab.id)
                  }
                }}
                className={`group flex h-8 max-w-48 items-center gap-2 rounded-md px-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <TerminalIcon size={13} className="shrink-0 text-zinc-500" />
                <span className="truncate">{tab.name}</span>
                {tab.exited && <span className="text-[10px] text-zinc-600">exited</span>}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    requestCloseTab(tab.id)
                  }}
                  className="rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100"
                  aria-label={`Close ${tab.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <button
          ref={addButtonRef}
          type="button"
          onClick={() => {
            if (menuOpen) {
              setMenuOpen(false)
              return
            }
            void openNewTerminalMenu()
          }}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="New terminal"
          aria-expanded={menuOpen}
        >
          <Plus size={15} />
        </button>
        {menuOpen &&
          bottomTerminalOpen &&
          createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="w-48 overflow-hidden rounded-md bg-zinc-800 py-1 shadow-xl"
            >
              <button
                onClick={() => void handleCreatePlainTerminal()}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <TerminalIcon size={14} className="mr-2 text-zinc-500" />
                Plain Terminal
              </button>
              <div className="my-1 border-t border-zinc-700" />
              <div className="px-3 py-1 text-[11px] font-medium text-zinc-500">Saved Commands</div>
              {savedCommands.map((command) => (
                <button
                  key={command.id}
                  onClick={() => void handleExecuteSavedCommand(command.id)}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  <TerminalIcon size={14} className="mr-2 text-zinc-500" />
                  <span className="truncate">{command.name}</span>
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>

      <div className="relative min-h-0 flex-1">
        {terminalTabs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <h3 className="font-ovo text-3xl tracking-tight text-zinc-300">No Terminals</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Terminal sessions will appear here.
            </p>
          </div>
        )}
        {terminalTabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            id={tab.id}
            active={bottomTerminalOpen && tab.id === visibleActiveTabId}
          />
        ))}
      </div>
    </section>
  )
}
