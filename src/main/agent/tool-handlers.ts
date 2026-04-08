/**
 * Shared tool handler functions used by both the in-process SDK MCP server
 * (tools.ts) and the HTTP MCP server (mcp-http-server.ts).
 */
import { readFile, writeFile, unlink, readdir, stat, mkdir, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, resolve, relative, parse as pathParse } from 'path'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { LoopManager } from '../loop-manager'
import type { SkillManager } from '../skill-manager'

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

export interface LoopHandlerDeps {
  getLoopManager: () => LoopManager | null
  getTaskManager: () => TaskManager | null
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

function requireLoopManager(deps: LoopHandlerDeps): LoopManager {
  const mgr = deps.getLoopManager()
  if (!mgr) throw new Error('Loop manager not available')
  return mgr
}

function requireFolder(deps: FileHandlerDeps): string {
  const folder = deps.getCurrentFolder()
  if (!folder) throw new Error('No project folder selected')
  return folder
}

// ── Task tool handlers ──

export async function handleCreateTask(
  args: { title: string; column?: 'planning' | 'in-progress' | 'review' | 'done' },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const board = await mgr.loadBoard()
    const id = mgr.generateId()
    const col = args.column || 'planning'
    board.columns[col].push(id)
    board.tasks[id] = {
      title: args.title,
      type: 'task',
      createdAt: new Date().toISOString()
    }
    await mgr.saveBoard(board)
    await mgr.writeMarkdown(id, `# ${args.title}\n\n`)
    deps.notifyStateChanged('tasks')
    return ok({ id, title: args.title, column: col })
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
    const board = await mgr.loadBoard()
    if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    const content = await mgr.readMarkdown(args.task_id)
    return ok({ id: args.task_id, title: board.tasks[args.task_id].title, content })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleListTasks(deps: TaskHandlerDeps): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const board = await mgr.loadBoard()
    const result: Record<string, Array<{ id: string; title: string; type: string }>> = {}
    for (const [col, ids] of Object.entries(board.columns)) {
      result[col] = ids
        .filter((id) => board.tasks[id])
        .map((id) => ({
          id,
          title: board.tasks[id].title,
          type: board.tasks[id].type || 'task'
        }))
    }
    return ok(result)
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
    const board = await mgr.loadBoard()
    if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
      board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
    }
    board.columns[args.column].push(args.task_id)
    await mgr.saveBoard(board)
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id, column: args.column })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleEditTask(
  args: { task_id: string; title?: string; content?: string },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const board = await mgr.loadBoard()
    if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    if (args.title) {
      board.tasks[args.task_id].title = args.title
      await mgr.saveBoard(board)
    }
    if (args.content !== undefined) {
      await mgr.writeMarkdown(args.task_id, args.content)
    }
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id })
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
    const board = await mgr.loadBoard()
    if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
      board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
    }
    const taskMeta = board.tasks[args.task_id]
    delete board.tasks[args.task_id]
    await mgr.saveBoard(board)
    if (taskMeta.type === 'task') {
      await mgr.deleteMarkdown(args.task_id)
    }
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleSendToAgent(
  args: { task_id: string; agent?: 'claude-code' | 'codex' },
  deps: TaskHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireTaskManager(deps)
    const board = await mgr.loadBoard()
    if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
    const agent = args.agent || 'claude-code'
    // Move to in-progress
    for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
      board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
    }
    board.columns['in-progress'].unshift(args.task_id)
    await mgr.saveBoard(board)
    deps.notifyStateChanged('task-agent', { taskId: args.task_id, agent })
    deps.notifyStateChanged('tasks')
    return ok({ id: args.task_id, agent })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// ── Loop tool handlers ──

export async function handleListLoops(deps: LoopHandlerDeps): Promise<McpResponse> {
  try {
    const mgr = requireLoopManager(deps)
    const loops = await mgr.listLoops()
    const result = loops.map((l) => ({
      id: l.id,
      name: l.name,
      stepCount: l.steps.length,
      agentType: l.agentType,
      scheduleEnabled: l.schedule.enabled,
      cron: l.schedule.cron,
      lastRunStatus: l.lastRun?.status
    }))
    return ok(result)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleCreateLoop(
  args: { name: string; steps: string[]; agent_type?: 'claude-code' | 'codex'; cron?: string },
  deps: LoopHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireLoopManager(deps)
    const id = mgr.generateId()
    const now = new Date().toISOString()
    const loop = {
      id,
      name: args.name,
      steps: args.steps.map((prompt, i) => ({
        id: `step-${i + 1}`,
        prompt
      })),
      schedule: {
        enabled: !!args.cron,
        cron: args.cron || ''
      },
      agentType: (args.agent_type || 'claude-code') as 'claude-code' | 'codex',
      createdAt: now,
      updatedAt: now
    }
    await mgr.saveLoop(loop)
    // Also add to task board as a loop-type task
    try {
      const taskMgr = deps.getTaskManager()
      if (taskMgr) {
        const board = await taskMgr.loadBoard()
        const taskId = taskMgr.generateId()
        board.columns.planning.push(taskId)
        board.tasks[taskId] = {
          title: args.name,
          type: 'loop',
          createdAt: now,
          loopId: id
        }
        await taskMgr.saveBoard(board)
        deps.notifyStateChanged('tasks')
      }
    } catch (boardErr) {
      console.warn('[Tools] Failed to add loop to board:', boardErr)
    }
    deps.notifyStateChanged('loops')
    return ok({ id, name: args.name, stepCount: loop.steps.length })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export async function handleTriggerLoop(
  args: { loop_id: string },
  deps: LoopHandlerDeps
): Promise<McpResponse> {
  try {
    const mgr = requireLoopManager(deps)
    const loop = await mgr.loadLoop(args.loop_id)
    if (!loop) return fail(`Loop ${args.loop_id} not found`)
    if (!loop.steps || loop.steps.length === 0) {
      return fail(`Loop ${args.loop_id} has no steps`)
    }
    deps.notifyStateChanged('loop-trigger', { loopId: args.loop_id })
    return ok({ loopId: args.loop_id, name: loop.name })
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
    const history = await git.getHistory(args.limit || 10)
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
      matches.length === 1
        ? matches[0]
        : matches.find((s) => s.source === 'project') || matches[0]
    const content = await mgr.getSkillContent(skill.path)
    return ok({ name: skill.name, content })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}
