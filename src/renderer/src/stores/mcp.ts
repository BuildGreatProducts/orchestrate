import { create } from 'zustand'
import type {
  McpConnectionStatus,
  McpProjectSelection,
  McpRegistrySnapshot,
  McpServerConfig,
  McpServerInput
} from '@shared/types'
import { toast } from './toast'

interface McpState {
  servers: McpServerConfig[]
  project: McpProjectSelection | null
  isLoading: boolean
  error: string | null

  loadRegistry: (projectFolder?: string | null) => Promise<void>
  addServer: (input: McpServerInput, enableForProject?: string | null) => Promise<void>
  importServers: (inputs: McpServerInput[], enableForProject?: string | null) => Promise<void>
  updateServer: (id: string, input: McpServerInput, projectFolder?: string | null) => Promise<void>
  removeServer: (id: string, projectFolder?: string | null) => Promise<void>
  setProjectEnabled: (projectFolder: string, serverId: string, enabled: boolean) => Promise<void>
  testServer: (id: string, projectFolder?: string | null) => Promise<McpConnectionStatus | null>
  startOAuth: (id: string, projectFolder?: string | null) => Promise<McpConnectionStatus | null>
}

function applySnapshot(
  set: (state: Partial<McpState>) => void,
  snapshot: McpRegistrySnapshot
): void {
  set({ servers: snapshot.servers, project: snapshot.project, isLoading: false, error: null })
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  project: null,
  isLoading: false,
  error: null,

  loadRegistry: async (projectFolder) => {
    set({ isLoading: true, error: null })
    try {
      const snapshot = await window.orchestrate.listMcpRegistry(projectFolder ?? undefined)
      applySnapshot(set, snapshot)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false })
    }
  },

  addServer: async (input, enableForProject) => {
    try {
      await window.orchestrate.addMcpServer(input, enableForProject ?? null)
      await get().loadRegistry(enableForProject)
      toast.info('MCP server added.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  },

  importServers: async (inputs, enableForProject) => {
    let created = 0
    let updated = 0
    let importError: unknown
    try {
      const existingByName = new Map(
        get().servers.map((server) => [server.name.trim().toLowerCase(), server])
      )
      for (const input of inputs) {
        const existing = existingByName.get(input.name.trim().toLowerCase())
        if (existing) {
          await window.orchestrate.updateMcpServer(existing.id, input)
          if (enableForProject) {
            await window.orchestrate.setProjectMcpEnabled(enableForProject, existing.id, true)
          }
          updated += 1
        } else {
          const createdServer = await window.orchestrate.addMcpServer(
            input,
            enableForProject ?? null
          )
          existingByName.set(createdServer.name.trim().toLowerCase(), createdServer)
          created += 1
        }
      }
    } catch (err) {
      importError = err
    } finally {
      await get().loadRegistry(enableForProject)
    }
    if (importError) {
      set({ error: importError instanceof Error ? importError.message : String(importError) })
      throw importError
    }
    toast.info(`MCP import complete: ${created} added${updated ? `, ${updated} updated` : ''}.`)
  },

  updateServer: async (id, input, projectFolder) => {
    try {
      await window.orchestrate.updateMcpServer(id, input)
      await get().loadRegistry(projectFolder)
      toast.info('MCP server updated.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  },

  removeServer: async (id, projectFolder) => {
    try {
      await window.orchestrate.removeMcpServer(id)
      await get().loadRegistry(projectFolder)
      toast.info('MCP server removed.')
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  setProjectEnabled: async (projectFolder, serverId, enabled) => {
    try {
      const project = await window.orchestrate.setProjectMcpEnabled(
        projectFolder,
        serverId,
        enabled
      )
      set({ project })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  testServer: async (id, projectFolder) => {
    try {
      const status = await window.orchestrate.testMcpServer(id)
      await get().loadRegistry(projectFolder)
      return status
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  startOAuth: async (id, projectFolder) => {
    try {
      const status = await window.orchestrate.startMcpOAuth(id)
      await get().loadRegistry(projectFolder)
      return status
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }
}))
