// ── Tab Navigation ──

export type TabId = 'orchestrate' | 'agents' | 'tasks' | 'files' | 'history' | 'browser'

export const TAB_LIST: { id: TabId; label: string }[] = [
  { id: 'orchestrate', label: 'Orchestrate' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'agents', label: 'Agents' },
  { id: 'files', label: 'Files' },
  { id: 'history', label: 'History' },
  { id: 'browser', label: 'Browser' }
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

// ── Chat History ──

export interface ChatConversation {
  id: string
  title: string
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  messages: ChatMessageData[]
}

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
  items?: StreamItemData[]
  timestamp: number
}

// Fix #7: discriminated union matching runtime StreamItem
export type StreamItemData =
  | { kind: 'text'; content: string }
  | { kind: 'tool_use'; tool: string; input: Record<string, unknown> }

export interface ChatConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string // last user message truncated to ~80 chars
}

// ── Git / History ──

export interface CommitNode {
  hash: string
  parents: string[]
  refs: string[]
  message: string
  date: string
  author: string
}

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  isRemote: boolean
}

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

// ── Agent Skills ──

export interface SkillMeta {
  name: string
  description: string
  path: string // absolute path to skill directory
  source: 'global' | 'project'
  enabled: boolean
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

// ── Browser ──

export interface BrowserTabInfo {
  id: string
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

// ── IPC API Contract ──

export interface OrchestrateAPI {
  // Folder
  selectFolder: () => Promise<string | null>
  getLastFolder: () => Promise<string | null>
  getProjects: () => Promise<string[]>
  addProject: (path: string) => Promise<string[]>
  removeProject: (path: string) => Promise<string[]>
  setActiveProject: (path: string) => Promise<string>

  // Files
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  listDirectory: (path: string) => Promise<FileEntry[]>
  createFile: (path: string) => Promise<void>
  createFolder: (path: string) => Promise<void>
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
  setApiKey: (key: string) => Promise<void>
  hasApiKey: () => Promise<boolean>
  clearAgentConversation: () => Promise<void>
  cancelAgentMessage: () => Promise<void>
  onAgentStateChanged: (callback: (domain: string, data?: unknown) => void) => () => void

  // Chat History
  listConversations: () => Promise<ChatConversationSummary[]>
  loadConversation: (id: string) => Promise<ChatConversation | null>
  saveConversation: (conversation: ChatConversation) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>

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
  getCommitGraph: (limit?: number, branch?: string) => Promise<CommitNode[]>
  getBranches: () => Promise<BranchInfo[]>

  // Browser
  createBrowserTab: (id: string, url: string) => Promise<void>
  closeBrowserTab: (id: string) => Promise<void>
  navigateBrowser: (id: string, url: string) => Promise<void>
  browserGoBack: (id: string) => Promise<void>
  browserGoForward: (id: string) => Promise<void>
  browserReload: (id: string) => Promise<void>
  browserStop: (id: string) => Promise<void>
  setBrowserBounds: (id: string, bounds: BrowserBounds) => Promise<void>
  showBrowserTab: (id: string) => Promise<void>
  hideAllBrowserTabs: () => Promise<void>
  closeAllBrowserTabs: () => Promise<void>
  toggleBrowserDevTools: (id: string) => Promise<void>
  onBrowserTabUpdated: (callback: (tab: BrowserTabInfo) => void) => () => void
  onBrowserTabClosed: (callback: (id: string) => void) => () => void

  // Skills
  getSkills: () => Promise<SkillMeta[]>
  addSkillFromFolder: (sourcePath: string, target: 'global' | 'project') => Promise<SkillMeta>
  addSkillFromZip: (zipPath: string, target: 'global' | 'project') => Promise<SkillMeta>
  addSkillFromGit: (repoUrl: string, target: 'global' | 'project') => Promise<SkillMeta>
  removeSkill: (skillPath: string) => Promise<void>
  setSkillEnabled: (skillPath: string, enabled: boolean) => Promise<void>
  getSkillContent: (skillPath: string) => Promise<string>
  openSkillsFolder: (target: 'global' | 'project') => Promise<void>
}
