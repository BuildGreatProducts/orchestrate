// ── Navigation ──

export type NavPageId = 'skills' | 'browser' | 'settings'

export const NAV_PAGES: { id: NavPageId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'browser', label: 'Browser' }
]

export type ProjectDetailTabId = 'browser' | 'commands' | 'files' | 'history' | 'skills' | 'mcp'

export type ContentView =
  | { type: 'orchestrate' }
  | { type: 'project-detail' }
  | { type: 'terminal' }
  | { type: 'page'; pageId: NavPageId }
  | { type: 'worktree-detail'; worktreePath: string }

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

// ── Simple Tasks ──

export type TaskMode = 'plan' | 'build'

export type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'failed'

export interface TaskSchedule {
  enabled: boolean
  cron: string // e.g. "0 10 * * *"
}

export interface SimpleTaskRun {
  id: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'completed' | 'failed'
  terminalId?: string
  worktreePath?: string
  exitCode?: number
}

export interface SimpleTask {
  id: string
  prompt: string
  mode: TaskMode
  status: TaskStatus
  branchName: string
  agentType: AgentType
  pinned: boolean
  schedule?: TaskSchedule
  createdAt: string
  updatedAt: string
  lastRun?: SimpleTaskRun
}

export interface TaskListState {
  version: 1
  order: string[]
  tasks: Record<string, SimpleTask>
}

export interface CreateSimpleTaskInput {
  prompt: string
  mode: TaskMode
  branchName?: string
  agentType: AgentType
  pinned?: boolean
  schedule?: TaskSchedule
}

export type UpdateSimpleTaskInput = Partial<
  Pick<
    SimpleTask,
    'prompt' | 'mode' | 'branchName' | 'agentType' | 'pinned' | 'schedule' | 'status'
  >
>

// ── Legacy Kanban / Tasks ──

export type ColumnId = 'planning' | 'in-progress' | 'review' | 'done'

export interface TaskStep {
  id: string
  prompt: string
}

export interface TaskRun {
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

export interface TaskMeta {
  title: string
  createdAt: string
  steps?: TaskStep[]
  lastRun?: TaskRun
  schedule?: TaskSchedule
  agentType?: AgentType // agent to use for scheduled runs
  groupName?: string // agent group to place terminal tabs in
  worktree?: {
    enabled: boolean
    branchName?: string
  }
}

export interface BoardState {
  columns: Record<ColumnId, string[]>
  tasks: Record<string, TaskMeta>
}

// ── Saved Commands ──

export interface SavedCommandEntry {
  label?: string
  command: string
}

export type CommandScope = 'project' | 'global'

export interface SavedCommand {
  id: string
  name: string
  scope: CommandScope
  commands: SavedCommandEntry[]
  createdAt: string
  updatedAt: string
}

// ── Agents ──

export type AgentType = string

export interface AgentConfig {
  id: string
  displayName: string
  cliCommand: string
  enabled: boolean
  builtin: boolean
  mcpMode: 'config-file' | 'codex-flags' | 'custom' | 'none'
  commandTemplate: string
  mcpFlagTemplate?: string
}

// ── Git / History ──

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
  isDetached: boolean
}

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

// ── MCP Registry ──

export type McpTransportType = 'stdio' | 'streamable-http' | 'sse'
export type McpAuthType = 'none' | 'secret' | 'oauth'

export interface McpSecretField {
  name: string
  hasValue: boolean
}

export interface McpAuthState {
  type: McpAuthType
  connected: boolean
  needsAuth?: boolean
  error?: string
}

export type McpConnectionState = 'unknown' | 'connected' | 'error' | 'auth-required' | 'testing'

export interface McpConnectionStatus {
  serverId: string
  state: McpConnectionState
  message?: string
  toolCount?: number
  checkedAt?: string
}

export interface McpServerConfig {
  id: string
  name: string
  slug: string
  transport: McpTransportType
  enabled: boolean
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  authType: McpAuthType
  env: McpSecretField[]
  headers: McpSecretField[]
  auth: McpAuthState
  status?: McpConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface McpServerInput {
  name: string
  transport: McpTransportType
  enabled?: boolean
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  authType?: McpAuthType
  env?: Record<string, string>
  headers?: Record<string, string>
}

export interface McpProjectSelection {
  projectFolder: string
  enabledServerIds: string[]
}

export interface McpRegistrySnapshot {
  servers: McpServerConfig[]
  project: McpProjectSelection | null
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

export interface BrowserSnapshot {
  dataUrl: string
  bounds: BrowserBounds
}

// ── Updates ──

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfo {
  version: string
  releaseDate?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateState {
  status: UpdateStatus
  info?: UpdateInfo
  progress?: UpdateProgress
  error?: string
}

// ── IPC API Contract ──

export interface TerminalDimensions {
  cols: number
  rows: number
}

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
  createTerminal: (
    id: string,
    cwd: string,
    command?: string,
    dimensions?: TerminalDimensions
  ) => Promise<void>
  writeTerminal: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  closeTerminal: (id: string) => Promise<void>
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void

  // Tasks
  loadTasks: () => Promise<TaskListState>
  loadTasksForProject: (projectFolder: string) => Promise<TaskListState>
  saveTasks: (tasks: TaskListState) => Promise<void>
  saveTasksForProject: (projectFolder: string, tasks: TaskListState) => Promise<void>
  deleteTask: (
    id: string
  ) => Promise<
    { success: true; id: string; deleted: boolean } | { success: false; id?: string; error: string }
  >
  sendToAgent: (id: string, agent: AgentType) => Promise<void>
  sendToAgentForProject: (projectFolder: string, id: string, agent: AgentType) => Promise<void>

  // Legacy task aliases
  loadBoard: () => Promise<BoardState>
  saveBoard: (board: BoardState) => Promise<void>
  readTaskMarkdown: (id: string) => Promise<string>
  writeTaskMarkdown: (id: string, content: string) => Promise<void>

  // Task schedule triggers
  onTaskScheduleTrigger: (
    callback: (taskId: string, projectFolder?: string | null) => void
  ) => () => void

  // Saved Commands
  listCommands: (projectFolder?: string) => Promise<SavedCommand[]>
  loadCommand: (
    id: string,
    scope: CommandScope,
    projectFolder?: string
  ) => Promise<SavedCommand | null>
  saveCommand: (command: SavedCommand, projectFolder?: string) => Promise<void>
  deleteCommand: (id: string, scope: CommandScope, projectFolder?: string) => Promise<void>

  // MCP State Changes (used by MCP server tool handlers)
  onAgentStateChanged: (callback: (domain: string, data?: unknown) => void) => () => void

  // Git / History
  isGitRepo: (projectFolder?: string) => Promise<boolean>
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

  // Branches (project-specific)
  listBranches: (projectFolder: string) => Promise<BranchInfo[]>
  checkoutBranch: (projectFolder: string, branch: string) => Promise<void>
  createBranch: (projectFolder: string, branch: string) => Promise<void>
  deleteBranch: (projectFolder: string, branch: string, force?: boolean) => Promise<void>
  getRemoteUrl: (projectFolder: string) => Promise<string | null>

  // Worktrees
  listWorktrees: (projectFolder: string) => Promise<WorktreeInfo[]>
  addWorktree: (
    projectFolder: string,
    path: string,
    branch: string,
    createBranch: boolean
  ) => Promise<void>
  removeWorktree: (projectFolder: string, worktreePath: string, force?: boolean) => Promise<void>
  diffWorktreeFiles: (
    projectFolder: string,
    baseBranch: string,
    compareBranch: string
  ) => Promise<FileDiff[]>
  diffWorktreeFile: (
    projectFolder: string,
    baseBranch: string,
    compareBranch: string,
    filePath: string
  ) => Promise<{ before: string; after: string }>
  mergeWorktree: (
    projectFolder: string,
    branch: string
  ) => Promise<{ success: boolean; conflicts?: string[] }>

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
  captureBrowserTab: (id: string) => Promise<BrowserSnapshot | null>
  closeAllBrowserTabs: () => Promise<void>
  toggleBrowserDevTools: (id: string) => Promise<void>
  onBrowserTabUpdated: (callback: (tab: BrowserTabInfo) => void) => () => void
  onBrowserTabClosed: (callback: (id: string) => void) => () => void

  // MCP
  getMcpServerUrl: () => Promise<string | null>
  getMcpConfigPath: () => Promise<string | null>
  getCodexMcpFlags: () => Promise<string | null>
  getMcpConfigPathForProject: (projectFolder: string, taskId?: string) => Promise<string | null>
  getCodexMcpFlagsForProject: (projectFolder: string, taskId?: string) => Promise<string | null>
  listMcpRegistry: (projectFolder?: string) => Promise<McpRegistrySnapshot>
  addMcpServer: (
    input: McpServerInput,
    enableForProject?: string | null
  ) => Promise<McpServerConfig>
  updateMcpServer: (id: string, input: McpServerInput) => Promise<McpServerConfig>
  removeMcpServer: (id: string) => Promise<void>
  setProjectMcpEnabled: (
    projectFolder: string,
    serverId: string,
    enabled: boolean
  ) => Promise<McpProjectSelection>
  testMcpServer: (id: string) => Promise<McpConnectionStatus>
  startMcpOAuth: (id: string) => Promise<McpConnectionStatus>

  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>

  // Updates
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => void
  onUpdateState: (callback: (state: UpdateState) => void) => () => void

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
