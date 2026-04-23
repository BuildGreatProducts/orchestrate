import Store from 'electron-store'

interface SessionEntry {
  id: string
  cwd: string
  command?: string
  createdAt: number
}

const store = new Store<{ terminalSessions: SessionEntry[] }>({
  name: 'terminal-sessions',
  defaults: { terminalSessions: [] }
})

export function saveTerminalSessions(sessions: SessionEntry[]): void {
  store.set('terminalSessions', sessions)
}

export function loadTerminalSessions(): SessionEntry[] {
  return store.get('terminalSessions', [])
}

export function clearTerminalSessions(): void {
  store.set('terminalSessions', [])
}