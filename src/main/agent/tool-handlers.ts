/**
 * Shared tool handler functions used by both the in-process SDK MCP server
 * (tools.ts) and the HTTP MCP server (mcp-http-server.ts).
 */
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'

// ── Response helpers ──

type McpResponse = { content: [{ type: 'text'; text: string }] }

function ok(data: unknown): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data }) }] }
}

function fail(error: string): McpResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error }) }] }
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

// ── Task tool handlers ──

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
