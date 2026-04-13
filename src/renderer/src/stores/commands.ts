import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { toast } from './toast'
import type { SavedCommand } from '@shared/types'

interface CommandsState {
  commands: SavedCommand[]
  isLoading: boolean
  hasLoaded: boolean
  editingCommand: Partial<SavedCommand> | null

  loadCommands: (projectFolder?: string) => Promise<void>
  resetCommands: () => void
  createCommand: (data: Omit<SavedCommand, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SavedCommand>
  updateCommand: (command: SavedCommand) => Promise<void>
  deleteCommand: (id: string, scope: 'project' | 'global') => Promise<void>
  setEditingCommand: (command: Partial<SavedCommand> | null) => void
}

let loadRequestId = 0

export const useCommandsStore = create<CommandsState>((set, get) => ({
  commands: [],
  isLoading: false,
  hasLoaded: false,
  editingCommand: null,

  loadCommands: async (projectFolder?) => {
    const reqId = ++loadRequestId
    set({ isLoading: true })
    try {
      const commands = await window.orchestrate.listCommands(projectFolder)
      if (reqId !== loadRequestId) return
      set({ commands, isLoading: false, hasLoaded: true })
    } catch (err) {
      if (reqId !== loadRequestId) return
      console.error('[Commands] Failed to load commands:', err)
      set({ commands: [], isLoading: false, hasLoaded: true })
    }
  },

  resetCommands: () => {
    ++loadRequestId
    set({ commands: [], hasLoaded: false, isLoading: false, editingCommand: null })
  },

  createCommand: async (data) => {
    const id = nanoid(8)
    const now = new Date().toISOString()
    const command: SavedCommand = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now
    }
    try {
      await window.orchestrate.saveCommand(command)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save command: ${msg}`)
      throw err
    }
    set((state) => ({ commands: [command, ...state.commands] }))
    return command
  },

  updateCommand: async (command) => {
    const updated = { ...command, updatedAt: new Date().toISOString() }
    const existing = get().commands.find((c) => c.id === command.id)
    const scopeChanged = existing && existing.scope !== updated.scope
    try {
      await window.orchestrate.saveCommand(updated)
      if (scopeChanged) {
        await window.orchestrate.deleteCommand(existing.id, existing.scope)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to update command: ${msg}`)
      throw err
    }
    set((state) => ({
      commands: state.commands.map((c) => (c.id === command.id ? updated : c))
    }))
  },

  deleteCommand: async (id, scope) => {
    try {
      await window.orchestrate.deleteCommand(id, scope)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to delete command: ${msg}`)
      throw err
    }
    set((state) => ({
      commands: state.commands.filter((c) => c.id !== id),
      editingCommand: state.editingCommand?.id === id ? null : state.editingCommand
    }))
  },

  setEditingCommand: (command) => set({ editingCommand: command })
}))
