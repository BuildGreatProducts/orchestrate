// ── Tab Navigation ──

export type TabId = 'manage' | 'agents' | 'tasks' | 'files' | 'history'

export const TAB_LIST: { id: TabId; label: string }[] = [
  { id: 'manage', label: 'Manage' },
  { id: 'agents', label: 'Agents' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'files', label: 'Files' },
  { id: 'history', label: 'History' }
]

// ── File System ──

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

// ── Tasks / Kanban ──

export type ColumnId = 'draft' | 'planning' | 'in-progress' | 'review' | 'done'

export interface TaskMeta {
  title: string
  createdAt: string
}

export interface BoardState {
  columns: Record<ColumnId, string[]>
  tasks: Record<string, TaskMeta>
}

// ── Agents ──

export type AgentType = 'claude-code' | 'codex'

export interface AgentResponseChunk {
  type: 'text' | 'tool_use' | 'done' | 'error'
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

// ── Git / History ──

export interface SavePoint {
  hash: string
  message: string
  date: string
  filesChanged: number
  insertions: number
  deletions: number
  isAutoSave: boolean
}

export interface SavePointDetail {
  hash: string
  message: string
  date: string
  files: FileDiff[]
}

export interface GitStatus {
  modified: string[]
  added: string[]
  deleted: string[]
  untracked: string[]
}

export interface FileDiff {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  insertions: number
  deletions: number
}

// ── IPC API Contract ──

export interface OrchestrateAPI {
  // Folder
  selectFolder: () => Promise<string | null>
  getLastFolder: () => Promise<string | null>

  // Files
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  listDirectory: (path: string) => Promise<FileEntry[]>
  watchFolder: (callback: (event: FileChangeEvent) => void) => () => void

  // Terminals
  createTerminal: (id: string, cwd: string, command?: string) => Promise<void>
  writeTerminal: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  closeTerminal: (id: string) => Promise<void>
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void

  // Tasks
  loadBoard: () => Promise<BoardState | null>
  saveBoard: (board: BoardState) => Promise<void>
  readTaskMarkdown: (id: string) => Promise<string>
  writeTaskMarkdown: (id: string, content: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  sendToAgent: (id: string, agent: AgentType) => Promise<void>

  // Manage Agent
  sendAgentMessage: (message: string) => Promise<void>
  onAgentResponse: (callback: (chunk: AgentResponseChunk) => void) => () => void
  onAgentToolUse: (callback: (tool: string, input: Record<string, unknown>) => void) => () => void

  // Git / History
  isGitRepo: () => Promise<boolean>
  initRepo: () => Promise<void>
  getHistory: (limit?: number) => Promise<SavePoint[]>
  getStatus: () => Promise<GitStatus>
  createSavePoint: (message: string) => Promise<string>
  getSavePointDetail: (hash: string) => Promise<SavePointDetail>
  getSavePointDiff: (hash: string, filePath: string) => Promise<{ before: string; after: string }>
  revertSavePoint: (hash: string) => Promise<void>
  restoreToSavePoint: (hash: string) => Promise<void>
  hasUncommittedChanges: () => Promise<boolean>
}
