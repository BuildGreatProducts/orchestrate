/**
 * Shared tool handler functions used by the HTTP MCP server (mcp-http-server.ts).
 */
import { readFile, writeFile, unlink, readdir, stat, mkdir, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, resolve, relative, parse as pathParse } from 'path'
import { CronExpressionParser } from 'cron-parser'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { SkillManager } from '../skill-manager'
import type { SimpleTask, TaskMode, TaskSchedule, TaskStatus } from '@shared/types'

// ── Deps interface ──

export interface ToolExecutorDeps {
  getCurrentFolder: () => string | null
  getTaskManager: () => TaskManager | null
  getTaskManagerForProject: (projectFolder: string) => TaskManager
  getGitManager: () => GitManager | null
  getGitManagerForProject: (projectFolder: string) => GitManager
  getSkillManager: () => SkillManager | null
  getWindow: () => import('electron').BrowserWindow | null
  notifyStateChanged: (domain: string, data?: unknown) => void
}

// ── Response helpers ──

type McpResponse = { content: [{ type: 'text'; text: string }] }

function ok(data: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data }) }] }
}

function fail(error: string): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error }) }] }
}

// ── Path validation ──

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  '.Trash',
  'thumbs.db',
  '.next',
  '.nuxt',
  'dist',
  'out',
  '.cache',
  '.turbo'
])

export async function validatePath(filePath: string, projectFolder: string): Promise<string> {
  const resolved = resolve(projectFolder, filePath)

  let realResolved: string
  let realRoot: string
  try {
    realResolved = await realpath(resolved)
  } catch {
    realResolved = resolved
  }
  try {
    realRoot = await realpath(projectFolder)
  } catch {
    realRoot = projectFolder
  }

  const rel = relative(realRoot, realResolved)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path outside project folder')
  }

  if (pathParse(realResolved).root !== pathParse(realRoot).root) {
    throw new Error('Path outside project folder')
  }

  return resolved
}

// ── Dependency interfaces ──

export interface TaskHandlerDeps {
  getTaskManager: () => TaskManager | null
  notifyStateChanged: (domain: string, data?: unknown) => void
}

export interface GitHandlerDeps {
  getGitManager: () => GitManager | null
  notifyStateChanged: (domain: string, data?: unknown) => void
}

export interface FileHandlerDeps {
  getCurrentFolder: () => string | null
  notifyStateChanged: (domain: string, data?: unknown) => void
}

export interface SkillHandlerDeps {
  getSkillManager: () => SkillManager | null
  getCurrentFolder: () => string | null
}

export interface TerminalHandlerDeps {
  notifyStateChanged: (domain: string, data?: unknown) => void
}

// ── Helpers ──

function requireTaskManager(deps: TaskHandlerDeps): TaskManager {
  const mgr = deps.getTaskManager()
  if (!mgr) throw new Error('Task manager not available')
  return mgr
}

function requireGitManager(deps: GitHandlerDeps): GitManager {
  const mgr = deps.getGitManager()
  if (!mgr) throw new Error('Git manager not available — is a project folder selected?')
  return mgr
}

function requireFolder(deps: FileHandlerDeps): string {
  const folder = deps.getCurrentFolder()
  if (!folder) throw new Error('No project folder selected')
  return folder
}

// ── Task tool handlers ──

function defaultTaskBranch(id: string): string {
  return `orchestrate/task-${id.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

function normalizeMode(mode: unknown): TaskMode {
  return mode === 'plan' ? 'plan' : 'build'
}

function normalizeAgent(agent: unknown, fallback = 'claude-code'): string {
  return typeof agent === 'string' && agent.trim() ? agent.trim() : fallback
}

function normalizeSchedule(schedule: unknown): TaskSchedule | undefined {
  if (!schedule || typeof schedule !== 'object') return undefined
  const raw = schedule as Record<string, unknown>
  const cron = typeof raw.cron === 'string' ? raw.cron.trim() : ''
  if (!cron) return undefined
  if ('enabled' in raw && typeof raw.enabled !== 'boolean') return undefined
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true
  try {
    CronExpressionParser.parse(cron)
  } catch {
    return undefined
  }
  return { enabled, cron }
}

function columnToStatus(column: 'planning' | 'in-progress' | 'review' | 'done'): TaskStatus {
  if (column === 'review') return 'review'
  if (column === 'done') return 'done'
  if (column === 'in-progress') return 'running'
  return 'todo'
}

function normalizeStatus(status: unknown): TaskStatus | undefined {
  if (
    status === 'todo' ||
    status === 'running' ||
    status === 'review' ||
    status === 'done' ||
    status === 'failed'
  ) {
    return status
  }
  return undefined
}

export async function handleCreateTask(
  args: {
    prompt?: string
    title?: string
    mode?: TaskMode
    branch?: string
    branchName?: string
    agent?: string
    pinned?: boolean
    schedule?: TaskSchedule
  },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const id = mgr.generateId()
    const prompt = (args.prompt || args.title || '').trim()
    if (!prompt) return fail('Task prompt is required')
    let schedule: TaskSchedule | undefined
    if (args.schedule !== undefined) {
      try {
        schedule = normalizeSchedule(args.schedule)
      } catch (err) {
        return fail(`Invalid schedule: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (!schedule) return fail('Invalid schedule')
    }
    const now = new Date().toISOString()
    const task: SimpleTask = {
      id,
      prompt,
      mode: normalizeMode(args.mode),
      status: 'todo',
      branchName: (args.branchName || args.branch || '').trim() || defaultTaskBranch(id),
      agentType: normalizeAgent(args.agent),
      pinned: args.pinned === true,
      schedule,
      createdAt: now,
      updatedAt: now
    }
    taskList.order.push(id)
    taskList.tasks[id] = task
    await mgr.saveTasks(taskList)
    deps.notifyStateChanged('tasks')
    return ok(task)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleReadTask(
  args: { task_id: string },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const task = taskList.tasks[args.task_id]
    if (!task) return fail(`Task ${args.task_id} not found`)
    return ok(task)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleListTasks(deps: TaskHandlerDeps): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const manual: SimpleTask[] = []
    const scheduled: SimpleTask[] = []
    for (const id of taskList.order) {
      const task = taskList.tasks[id]
      if (!task) continue
      if (task.schedule?.enabled) scheduled.push(task)
      else manual.push(task)
    }
    return ok({ manual, scheduled })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleMoveTask(
  args: { task_id: string; column: 'planning' | 'in-progress' | 'review' | 'done' },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const task = taskList.tasks[args.task_id]
    if (!task) return fail(`Task ${args.task_id} not found`)
    task.status = columnToStatus(args.column)
    task.updatedAt = new Date().toISOString()
    await mgr.saveTasks(taskList)
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id, status: task.status })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleEditTask(
  args: {
    task_id: string
    prompt?: string
    title?: string
    content?: string
    mode?: TaskMode
    branch?: string
    branchName?: string
    agent?: string
    pinned?: boolean
    schedule?: TaskSchedule | null
    status?: TaskStatus
  },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const task = taskList.tasks[args.task_id]
    if (!task) return fail(`Task ${args.task_id} not found`)
    const prompt = args.prompt ?? args.content ?? args.title
    if (prompt !== undefined) {
      const trimmed = prompt.trim()
      if (!trimmed) return fail('Task prompt is required')
      task.prompt = trimmed
    }
    if (args.mode !== undefined) task.mode = normalizeMode(args.mode)
    const branch = args.branchName ?? args.branch
    if (branch !== undefined) task.branchName = branch.trim() || defaultTaskBranch(args.task_id)
    if (args.agent !== undefined) task.agentType = normalizeAgent(args.agent, task.agentType)
    if (args.pinned !== undefined) task.pinned = args.pinned
    if (args.schedule !== undefined) {
      if (args.schedule === null) {
        task.schedule = undefined
      } else {
        let schedule: TaskSchedule | undefined
        try {
          schedule = normalizeSchedule(args.schedule)
        } catch (err) {
          return fail(`Invalid task schedule: ${err instanceof Error ? err.message : String(err)}`)
        }
        if (!schedule) return fail('Invalid task schedule')
        task.schedule = schedule
      }
    }
    if (args.status !== undefined) {
      const status = normalizeStatus(args.status)
      if (!status) return fail(`Invalid task status: ${String(args.status)}`)
      task.status = status
    }
    task.updatedAt = new Date().toISOString()
    await mgr.saveTasks(taskList)
    deps.notifyStateChanged('tasks')
    return ok(task)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleDeleteTask(
  args: { task_id: string },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    if (!taskList.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    taskList.order = taskList.order.filter((id) => id !== args.task_id)
    delete taskList.tasks[args.task_id]
    await mgr.saveTasks(taskList)
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleSendToAgent(
  args: { task_id: string; agent?: string },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const task = taskList.tasks[args.task_id]
    if (!task) return fail(`Task ${args.task_id} not found`)
    const agent = normalizeAgent(args.agent, normalizeAgent(task.agentType))
    deps.notifyStateChanged('task-agent', { taskId: args.task_id, agent })
    return ok({ id: args.task_id, agent })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleTriggerTask(
  args: { task_id: string },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const taskList = await mgr.loadTasks()
    const task = taskList.tasks[args.task_id]
    if (!task) return fail(`Task ${args.task_id} not found`)
    deps.notifyStateChanged('task-trigger', { taskId: args.task_id })
    return ok({ taskId: args.task_id, prompt: task.prompt })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// ── Terminal tool handlers ──

export async function handleSpawnTerminal(
  args: { name?: string; command?: string },
  deps: TerminalHandlerDeps
): Promise<McpResponse> {
  const terminalName = args.name || 'Terminal'
  deps.notifyStateChanged('terminal', { name: terminalName, command: args.command || null })
  return ok({ name: terminalName, command: args.command || null })
}

// ── File tool handlers ──

export async function handleReadFile(
  args: { path: string },
  deps: FileHandlerDeps
): Promise<McpResponse> {
  try {
    const folder = requireFolder(deps)
    const absPath = await validatePath(args.path, folder)
    const content = await readFile(absPath, 'utf-8')
    return ok({ path: args.path, content })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleWriteFile(
  args: { path: string; content: string },
  deps: FileHandlerDeps
): Promise<McpResponse> {
  try {
    const folder = requireFolder(deps)
    const absPath = await validatePath(args.path, folder)
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, args.content, 'utf-8')
    deps.notifyStateChanged('files')
    return ok({ path: args.path })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleListFiles(
  args: { path?: string },
  deps: FileHandlerDeps
): Promise<McpResponse> {
  try {
    const folder = requireFolder(deps)
    const dirPath = args.path || '.'
    const absPath = await validatePath(dirPath, folder)
    const entries = await readdir(absPath, { withFileTypes: true })
    const files: { name: string; isDirectory: boolean; size?: number }[] = []
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore')
        continue
      const entryPath = join(absPath, entry.name)
      const isDir = entry.isDirectory()
      let size: number | undefined
      if (!isDir) {
        try {
          const s = await stat(entryPath)
          size = s.size
        } catch {
          // skip
        }
      }
      files.push({ name: entry.name, isDirectory: isDir, size })
    }
    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return ok({ path: dirPath, files })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleDeleteFile(
  args: { path: string },
  deps: FileHandlerDeps
): Promise<McpResponse> {
  try {
    const folder = requireFolder(deps)
    const absPath = await validatePath(args.path, folder)
    await unlink(absPath)
    deps.notifyStateChanged('files')
    return ok({ path: args.path })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// ── Git tool handlers ──

export async function handleCreateSavePoint(
  args: { message: string },
  deps: GitHandlerDeps
): Promise<McpResponse> {
  try {
    const git = requireGitManager(deps)
    const isRepo = await git.isRepo()
    if (!isRepo) return fail('Not a git repository. Initialize one first from the History tab.')
    const hash = await git.createSavePoint(args.message)
    deps.notifyStateChanged('history')
    return ok({ hash: hash || '(no changes to commit)' })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleListSavePoints(
  args: { limit?: number },
  deps: GitHandlerDeps
): Promise<McpResponse> {
  try {
    const git = requireGitManager(deps)
    const isRepo = await git.isRepo()
    if (!isRepo) return fail('Not a git repository')
    const limit = args.limit ?? 10
    const history = await git.getHistory(limit)
    return ok(history)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleRestoreSavePoint(
  args: { hash: string },
  deps: GitHandlerDeps
): Promise<McpResponse> {
  try {
    const git = requireGitManager(deps)
    await git.restore(args.hash)
    deps.notifyStateChanged('history')
    deps.notifyStateChanged('files')
    return ok({ hash: args.hash })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleRevertSavePoint(
  args: { hash: string },
  deps: GitHandlerDeps
): Promise<McpResponse> {
  try {
    const git = requireGitManager(deps)
    await git.revert(args.hash)
    deps.notifyStateChanged('history')
    deps.notifyStateChanged('files')
    return ok({ hash: args.hash })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleGetChanges(deps: GitHandlerDeps): Promise<McpResponse> {
  try {
    const git = requireGitManager(deps)
    const isRepo = await git.isRepo()
    if (!isRepo) return fail('Not a git repository')
    const status = await git.getStatus()
    return ok(status)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// ── Skill tool handlers ──

export async function handleActivateSkill(
  args: { name: string },
  deps: SkillHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = deps.getSkillManager()
    if (!mgr) return fail('Skill manager not available')
    const folder = deps.getCurrentFolder()
    const skills = await mgr.discoverSkills(folder || undefined)
    const matches = skills.filter((s) => s.name === args.name && s.enabled)
    if (matches.length === 0) return fail(`Skill "${args.name}" not found or disabled`)
    const skill =
      matches.length === 1 ? matches[0] : matches.find((s) => s.source === 'project') || matches[0]
    const content = await mgr.getSkillContent(skill.path)
    return ok({ name: skill.name, content })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
