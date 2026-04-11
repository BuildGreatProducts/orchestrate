import { create } from 'zustand'
import type { AgentConfig } from '@shared/types'
import { BUILT_IN_AGENTS } from '@shared/built-in-agents'

interface AgentsState {
  agents: AgentConfig[]
  isLoaded: boolean

  loadAgents: () => Promise<void>
  getAgent: (id: string) => AgentConfig | undefined
  setAgentEnabled: (id: string, enabled: boolean) => Promise<void>
  addCustomAgent: (agent: Omit<AgentConfig, 'builtin'>) => Promise<void>
  removeCustomAgent: (id: string) => Promise<void>
  updateCustomAgent: (id: string, updates: Partial<Pick<AgentConfig, 'displayName' | 'cliCommand' | 'commandTemplate' | 'enabled'>>) => Promise<void>
}

function mergeWithBuiltins(saved: AgentConfig[] | null): AgentConfig[] {
  const result: AgentConfig[] = []
  const savedById = new Map<string, AgentConfig>()

  if (saved) {
    for (const a of saved) savedById.set(a.id, a)
  }

  // Add built-in agents, preserving user's enabled state if previously saved
  for (const builtin of BUILT_IN_AGENTS) {
    const existing = savedById.get(builtin.id)
    if (existing) {
      result.push({ ...builtin, enabled: existing.enabled })
      savedById.delete(builtin.id)
    } else {
      result.push({ ...builtin })
    }
  }

  // Add any custom (non-builtin) agents from saved data
  for (const agent of savedById.values()) {
    if (!agent.builtin) {
      result.push(agent)
    }
  }

  return result
}

let persistPromise = Promise.resolve()

function persistAgents(agents: AgentConfig[]): Promise<void> {
  persistPromise = persistPromise
    .catch(() => {})
    .then(() => window.orchestrate.setSetting('agents', agents))
  return persistPromise
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  isLoaded: false,

  loadAgents: async () => {
    const saved = (await window.orchestrate.getSetting('agents')) as AgentConfig[] | null
    const agents = mergeWithBuiltins(saved)
    set({ agents, isLoaded: true })
    await persistAgents(agents)
  },

  getAgent: (id: string) => {
    return get().agents.find((a) => a.id === id)
  },

  setAgentEnabled: async (id: string, enabled: boolean) => {
    const agents = get().agents.map((a) => (a.id === id ? { ...a, enabled } : a))
    set({ agents })
    await persistAgents(get().agents)
  },

  addCustomAgent: async (agent) => {
    const existing = get().agents
    if (existing.some((a) => a.id === agent.id)) {
      throw new Error(`Agent with id "${agent.id}" already exists`)
    }
    const agents = [...existing, { ...agent, builtin: false }]
    set({ agents })
    await persistAgents(get().agents)
  },

  removeCustomAgent: async (id: string) => {
    const agents = get().agents.filter((a) => !(a.id === id && !a.builtin))
    set({ agents })
    await persistAgents(get().agents)
  },

  updateCustomAgent: async (id: string, updates) => {
    const agents = get().agents.map((a) =>
      a.id === id && !a.builtin ? { ...a, ...updates } : a
    )
    set({ agents })
    await persistAgents(get().agents)
  }
}))
