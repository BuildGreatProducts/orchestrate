import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface TerminalOutput {
  id: string
  sessionId: string
  type: 'input' | 'output' | 'error' | 'system'
  content: string
  timestamp: number
}

interface TerminalState {
  sessions: Map<string, string[]>
  outputs: Map<string, TerminalOutput[]>
  filters: Map<string, string>
  
  addSession: (id: string) => void
  removeSession: (id: string) => void
  addOutput: (sessionId: string, output: Omit<TerminalOutput, 'id' | 'timestamp'>) => void
  clearOutputs: (sessionId: string) => void
  setFilter: (sessionId: string, filter: string) => void
  getFilteredOutputs: (sessionId: string) => TerminalOutput[]
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: new Map(),
  outputs: new Map(),
  filters: new Map(),

  addSession: (id) => set((state) => {
    const sessions = new Map(state.sessions)
    sessions.set(id, [])
    const outputs = new Map(state.outputs)
    outputs.set(id, [])
    return { sessions, outputs }
  }),

  removeSession: (id) => set((state) => {
    const sessions = new Map(state.sessions)
    sessions.delete(id)
    const outputs = new Map(state.outputs)
    outputs.delete(id)
    const filters = new Map(state.filters)
    filters.delete(id)
    return { sessions, outputs, filters }
  }),

  addOutput: (sessionId, output) => set((state) => {
    const outputs = new Map(state.outputs)
    const sessionOutputs = outputs.get(sessionId) || []
    const newOutput: TerminalOutput = {
      ...output,
      id: nanoid(),
      timestamp: Date.now()
    }
    outputs.set(sessionId, [...sessionOutputs, newOutput])
    return { outputs }
  }),

  clearOutputs: (sessionId) => set((state) => {
    const outputs = new Map(state.outputs)
    outputs.set(sessionId, [])
    return { outputs }
  }),

  setFilter: (sessionId, filter) => set((state) => {
    const filters = new Map(state.filters)
    filters.set(sessionId, filter)
    return { filters }
  }),

  getFilteredOutputs: (sessionId) => {
    const state = get()
    const outputs = state.outputs.get(sessionId) || []
    const filter = state.filters.get(sessionId) || ''
    if (!filter) return outputs
    const lowerFilter = filter.toLowerCase()
    return outputs.filter(o => o.content.toLowerCase().includes(lowerFilter))
  }
}))
