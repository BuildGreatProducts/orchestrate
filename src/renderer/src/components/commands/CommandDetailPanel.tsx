import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, GripVertical, Play, Globe, FolderOpen } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nanoid } from 'nanoid'
import type { SavedCommandEntry, CommandScope } from '@shared/types'
import { useCommandsStore } from '@renderer/stores/commands'
import { useAppStore } from '@renderer/stores/app'
import { executeSavedCommand } from '@renderer/lib/command-execution'
import { toast } from '@renderer/stores/toast'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'

interface SortableEntry extends SavedCommandEntry {
  _id: string
}

function SortableCommandEntry({
  entry,
  index,
  onChangeLabel,
  onChangeCommand,
  onDelete,
  canDelete
}: {
  entry: SortableEntry
  index: number
  onChangeLabel: (id: string, label: string) => void
  onChangeCommand: (id: string, command: string) => void
  onDelete: (id: string) => void
  canDelete: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: entry._id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-zinc-700/60 bg-zinc-800/50">
      <div className="flex items-center gap-2 border-b border-zinc-700/40 px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder command"
          className="shrink-0 cursor-grab text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <span className="text-[11px] font-medium text-zinc-500">Command {index + 1}</span>
        {canDelete && (
          <button
            onClick={() => onDelete(entry._id)}
            aria-label="Delete command entry"
            className="ml-auto shrink-0 text-zinc-600 hover:text-red-400"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">Command</label>
          <input
            type="text"
            value={entry.command}
            onChange={(e) => onChangeCommand(entry._id, e.target.value)}
            placeholder="e.g., npm run dev"
            className="w-full rounded border border-zinc-700 bg-zinc-900/50 px-2 py-1 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">Label <span className="text-zinc-600">(optional)</span></label>
          <input
            type="text"
            value={entry.label ?? ''}
            onChange={(e) => onChangeLabel(entry._id, e.target.value)}
            placeholder="e.g., Frontend server"
            className="w-full rounded border border-zinc-700/50 bg-transparent px-2 py-1 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}

export default function CommandDetailPanel(): React.JSX.Element | null {
  const commands = useCommandsStore((s) => s.commands)
  const editingCommand = useCommandsStore((s) => s.editingCommand)
  const setEditingCommand = useCommandsStore((s) => s.setEditingCommand)
  const createCommand = useCommandsStore((s) => s.createCommand)
  const updateCommand = useCommandsStore((s) => s.updateCommand)
  const deleteCommand = useCommandsStore((s) => s.deleteCommand)
  const currentFolder = useAppStore((s) => s.currentFolder)

  const [name, setName] = useState('')
  const [scope, setScope] = useState<CommandScope>('project')
  const [entries, setEntries] = useState<SortableEntry[]>([
    { _id: nanoid(6), label: '', command: '' }
  ])
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isEdit = !!editingCommand?.id
  const commandId = editingCommand?.id ?? null
  const existingCommand = commandId ? commands.find((c) => c.id === commandId) ?? null : null

  useEffect(() => {
    if (!editingCommand) return
    setName(editingCommand.name ?? '')
    setScope(editingCommand.scope ?? 'project')
    setEntries(
      editingCommand.commands?.length
        ? editingCommand.commands.map((c) => ({ ...c, _id: nanoid(6) }))
        : [{ _id: nanoid(6), label: '', command: '' }]
    )
    setMenuOpen(false)
    setConfirmingDelete(false)
  }, [editingCommand])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIdx = entries.findIndex((e) => e._id === active.id)
        const newIdx = entries.findIndex((e) => e._id === over.id)
        setEntries(arrayMove(entries, oldIdx, newIdx))
      }
    },
    [entries]
  )

  const handleLabelChange = useCallback((id: string, label: string) => {
    setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, label } : e)))
  }, [])

  const handleCommandChange = useCallback((id: string, command: string) => {
    setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, command } : e)))
  }, [])

  const handleEntryDelete = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e._id !== id))
  }, [])

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, { _id: nanoid(6), label: '', command: '' }])
  }, [])

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const validEntries = entries
      .filter((e) => e.command.trim())
      .map(({ label, command }) => ({
        ...(label?.trim() ? { label: label.trim() } : {}),
        command: command.trim()
      }))
    if (validEntries.length === 0) return

    try {
      if (isEdit) {
        if (!existingCommand) {
          toast.error('Command not found — it may have been deleted')
          setEditingCommand(null)
          return
        }
        await updateCommand({
          ...existingCommand,
          name: trimmedName,
          scope,
          commands: validEntries
        })
      } else {
        await createCommand({
          name: trimmedName,
          scope,
          commands: validEntries
        })
      }
      setEditingCommand(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save command: ${msg}`)
    }
  }, [name, scope, entries, isEdit, existingCommand, createCommand, updateCommand, setEditingCommand])

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    setConfirmingDelete(true)
  }, [])

  const handleRun = useCallback(() => {
    if (existingCommand && currentFolder) {
      executeSavedCommand(existingCommand.id, currentFolder)
    }
  }, [existingCommand, currentFolder])

  const canSave = name.trim() && entries.some((e) => e.command.trim())

  if (!editingCommand) return null

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-1/2 max-w-[700px] flex-col border-l border-zinc-800 bg-zinc-900 shadow-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Command name"
          className="min-w-0 flex-1 bg-transparent font-ovo text-xl text-zinc-200 outline-none placeholder:text-zinc-600"
          placeholder="Command name"
          autoFocus={!isEdit}
        />
        <div className="mt-1 flex flex-shrink-0 items-center gap-1">
          {isEdit && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3.5" r="1.25" />
                  <circle cx="8" cy="8" r="1.25" />
                  <circle cx="8" cy="12.5" r="1.25" />
                </svg>
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-32 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                  <button
                    role="menuitem"
                    onClick={handleDelete}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-400 hover:bg-zinc-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setEditingCommand(null)}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Scope */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Scope</label>
          <div className="flex gap-1 rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-1">
            <button
              type="button"
              onClick={() => setScope('project')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === 'project'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <FolderOpen size={12} />
              Project
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === 'global'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Globe size={12} />
              Global
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            {scope === 'global'
              ? 'Available in all projects'
              : 'Only available in this project'}
          </p>
        </div>

        {/* Terminal commands */}
        <div>
          <label className="mb-2 block text-xs text-zinc-500">Terminal Commands</label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={entries.map((e) => e._id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {entries.map((entry, idx) => (
                  <SortableCommandEntry
                    key={entry._id}
                    entry={entry}
                    index={idx}
                    onChangeLabel={handleLabelChange}
                    onChangeCommand={handleCommandChange}
                    onDelete={handleEntryDelete}
                    canDelete={entries.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            onClick={addEntry}
            className="mt-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            <Plus size={14} />
            Add command
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
        <div>
          {isEdit && (
            <button
              onClick={handleRun}
              disabled={!currentFolder}
              title={currentFolder ? undefined : 'Select a folder to run'}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${currentFolder ? 'text-green-400 hover:bg-zinc-800' : 'cursor-not-allowed text-zinc-600'}`}
            >
              <Play size={12} />
              Run
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="rounded bg-white px-4 py-1.5 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(0,0,0,0.4),0_0px_1px_rgba(0,0,0,0.3)] transition-colors hover:bg-zinc-100 active:bg-zinc-200 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] disabled:opacity-40 disabled:hover:bg-white"
        >
          {isEdit ? 'Save' : 'Create'}
        </button>
      </div>

      {confirmingDelete && existingCommand && (
        <ConfirmDialog
          title="Delete command"
          description={`Are you sure you want to delete "${existingCommand.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await deleteCommand(existingCommand.id, existingCommand.scope)
              setConfirmingDelete(false)
              setEditingCommand(null)
            } catch {
              setConfirmingDelete(false)
            }
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
