import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, X, FolderPlus } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'

export default function FolderSelector(): React.JSX.Element {
  const { currentFolder, setCurrentFolder, projects, addProject, removeProject } = useAppStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const folderName = currentFolder ? currentFolder.split(/[/\\]/).pop() : 'Select a project…'

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const handleAddProject = async (): Promise<void> => {
    const folder = await window.orchestrate.selectFolder()
    if (folder) {
      await addProject(folder)
      setCurrentFolder(folder)
    }
    setOpen(false)
  }

  const handleSwitch = (path: string): void => {
    setCurrentFolder(path)
    setOpen(false)
  }

  const handleRemove = async (e: React.MouseEvent, path: string): Promise<void> => {
    e.stopPropagation()
    await removeProject(path)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        title={currentFolder ?? 'No project selected'}
      >
        <ChevronDown
          size={14}
          className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <span className="max-w-[160px] truncate">{folderName}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[260px] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg">
          {projects.length > 0 && (
            <div className="max-h-[240px] overflow-y-auto py-1">
              {projects.map((path) => {
                const name = path.split(/[/\\]/).pop()
                const isActive = path === currentFolder
                return (
                  <button
                    key={path}
                    onClick={() => handleSwitch(path)}
                    className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700"
                    title={path}
                  >
                    <span className="w-4 flex-shrink-0">
                      {isActive && <Check size={14} className="text-emerald-400" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRemove(e, path)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRemove(e as unknown as React.MouseEvent, path)
                      }}
                      className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-600 group-hover:opacity-100"
                    >
                      <X size={12} className="text-zinc-400" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {projects.length > 0 && <div className="border-t border-zinc-700" />}
          <button
            onClick={handleAddProject}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
          >
            <FolderPlus size={14} />
            <span>Add Project…</span>
          </button>
        </div>
      )}
    </div>
  )
}
