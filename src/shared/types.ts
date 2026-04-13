// ── Navigation ──

export type NavPageId = 'skills' | 'browser' | 'settings'

export const NAV_PAGES: { id: NavPageId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'browser', label: 'Browser' }
]

export type ProjectDetailTabId = 'tasks' | 'files' | 'history'

export type ContentView =
  | { type: 'orchestrate' }
  | { type: 'project-detail' }
  | { type: 'terminal' }
  | { type: 'page'; pageId: NavPageId }

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

// ── Kanban / Tasks ──

export type ColumnId = 'planning' | 'in-progress' | 'review' | 'done'
export type TaskType = 'task' | 'loop'

export interface TaskSchedule {
  enabled: boolean
  cron: string // e.g. "0 9 * * 1-5"
}

export interface TaskMeta {
  title: string
  type: TaskType
  createdAt: string
  loopId?: string // present when type === 'loop', references Loop.id
  schedule?: TaskSchedule
  agentType?: AgentType // agent to use for scheduled runs
  groupName?: string // agent group to place terminal tabs in
}

export interface BoardState {
  columns: Record<ColumnId, string[]>
  tasks: Record<string, TaskMeta>
}

// ── Loops ──

export interface LoopStep {
  id: string
  prompt: string
}

export interface LoopSchedule {
  enabled: boolean
  cron: string // e.g. "0 9 * * 1-5"
}

export type LoopStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface LoopRun {
  id: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'completed' | 'failed'
  stepResults: {
    stepId: string
    terminalId: string
    exitCode?: number
    startedAt: string
    finishedAt?: string
  }[]
  groupId: string
}

export interface Loop {
  id: string
  name: string
  steps: LoopStep[]
  schedule: LoopSchedule
  agentType: AgentType
  createdAt: string
  updatedAt: string
  lastRun?: LoopRun
  groupName?: string // agent group to place step tabs in (defaults to loop name)
}

// ── Agents ──

export type AgentType = string

export interface AgentConfig {
  id: string
  displayName: string
  cliCommand: string
  enabled: boolean
  builtin: boolean
  mcpMode: 'config-file' | 'codex-flags' | 'none'
  commandTemplate: string
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
  setActiveProject: (path: string | null) => Promise<string | null>

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
  loadBoard: () => Promise<BoardState>
  saveBoard: (board: BoardState) => Promise<void>
  readTaskMarkdown: (id: string) => Promise<string>
  writeTaskMarkdown: (id: string, content: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  sendToAgent: (id: string, agent: AgentType) => Promise<void>

  // Loops
  listLoops: () => Promise<Loop[]>
  loadLoop: (id: string) => Promise<Loop | null>
  saveLoop: (loop: Loop) => Promise<void>
  deleteLoop: (id: string) => Promise<void>
  onLoopTrigger: (callback: (loopId: string) => void) => () => void
  onTaskScheduleTrigger: (callback: (taskId: string) => void) => () => void

  // MCP State Changes (used by MCP server tool handlers)
  onAgentStateChanged: (callback: (domain: string, data?: unknown) => void) => () => void

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

  // MCP
  getMcpServerUrl: () => Promise<string | null>
  getMcpConfigPath: () => Promise<string | null>
  getCodexMcpFlags: () => Promise<string | null>

  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>

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
