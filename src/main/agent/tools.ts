import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { BrowserWindow } from 'electron'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'
import { readFile, writeFile, unlink, readdir, stat, mkdir, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, resolve, relative, parse as pathParse } from 'path'
import type { ColumnId } from '@shared/types'

const VALID_COLUMNS: ColumnId[] = ['draft', 'planning', 'in-progress', 'review', 'done']

// ── Path validation ──

const IGNORED_NAMES = new Set([
  'node_modules', '.git', '.DS_Store', '.Trash', 'thumbs.db',
  '.next', '.nuxt', 'dist', 'out', '.cache', '.turbo'
])

async function validatePath(filePath: string, projectFolder: string): Promise<string> {
  const resolved = resolve(projectFolder, filePath)

  // Resolve symlinks to detect escapes via symlinked directories
  let realResolved: string
  let realRoot: string
  try {
    realResolved = await realpath(resolved)
  } catch {
    // Target doesn't exist yet (e.g. write_file creating a new file) —
    // fall back to the logical path but still validate the parent
    realResolved = resolved
  }
  try {
    realRoot = await realpath(projectFolder)
  } catch {
    realRoot = projectFolder
  }

  const rel = relative(realRoot, realResolved)

  // Reject paths that escape the project root:
  // - starts with '..' (traversal)
  // - is absolute (cross-drive on Windows, e.g. D:\ vs C:\)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path outside project folder')
  }

  // Extra guard: different drive roots on Windows
  if (pathParse(realResolved).root !== pathParse(realRoot).root) {
    throw new Error('Path outside project folder')
  }

  return resolved
}

// ── Deps interface (unchanged) ──

export interface ToolExecutorDeps {
  getCurrentFolder: () => string | null
  getTaskManager: () => TaskManager | null
  getGitManager: () => GitManager | null
  getPtyManager: () => PtyManager | null
  getWindow: () => BrowserWindow | null
  notifyToolUse: (tool: string, input: Record<string, unknown>) => void
  notifyStateChanged: (domain: string, data?: unknown) => void
}

// ── Helpers ──

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data }) }] }
}

function fail(error: string): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error }) }] }
}

// ── MCP server factory ──

export const ORCHESTRATE_TOOL_NAMES = [
  'create_task', 'edit_task', 'delete_task', 'move_task', 'list_tasks', 'read_task',
  'spawn_terminal', 'send_to_agent',
  'read_file', 'write_file', 'list_files', 'delete_file',
  'create_save_point', 'list_save_points', 'restore_save_point', 'revert_save_point', 'get_changes'
] as const

export function createOrchestrateServer(deps: ToolExecutorDeps) {
  const {
    getCurrentFolder,
    getTaskManager,
    getGitManager,
    notifyToolUse,
    notifyStateChanged
  } = deps

  function requireFolder(): string {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')
    return folder
  }

  function requireTaskManager(): TaskManager {
    const mgr = getTaskManager()
    if (!mgr) throw new Error('Task manager not available')
    return mgr
  }

  function requireGitManager(): GitManager {
    const mgr = getGitManager()
    if (!mgr) throw new Error('Git manager not available — is a project folder selected?')
    return mgr
  }

  function notify(toolName: string, args: Record<string, unknown>): void {
    notifyToolUse(toolName, args)
  }

  const columnEnum = z.enum(['draft', 'planning', 'in-progress', 'review', 'done'])

  return createSdkMcpServer({
    name: 'orchestrate',
    version: '1.0.0',
    tools: [
      // ── Task tools ──
      tool(
        'create_task',
        'Create a new task on the kanban board in the specified column.',
        {
          title: z.string().describe('The title of the task'),
          column: columnEnum.optional().describe('The column to place the task in (default: draft)'),
          markdown: z.string().optional().describe('Optional markdown content for the task')
        },
        async (args) => {
          notify('create_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const column = (args.column as ColumnId) || 'draft'
            const board = await mgr.loadBoard()
            const id = mgr.generateId()
            board.columns[column].push(id)
            board.tasks[id] = { title: args.title, createdAt: new Date().toISOString() }
            await mgr.saveBoard(board)
            await mgr.writeMarkdown(id, args.markdown || `# ${args.title}\n\n`)
            notifyStateChanged('tasks')
            return ok({ id, title: args.title, column })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'edit_task',
        'Edit an existing task title.',
        {
          task_id: z.string().describe('The ID of the task to edit'),
          title: z.string().describe('The new title for the task')
        },
        async (args) => {
          notify('edit_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            board.tasks[args.task_id].title = args.title
            await mgr.saveBoard(board)
            notifyStateChanged('tasks')
            return ok({ id: args.task_id, title: args.title })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'delete_task',
        'Delete a task from the board.',
        {
          task_id: z.string().describe('The ID of the task to delete')
        },
        async (args) => {
          notify('delete_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            for (const col of VALID_COLUMNS) {
              board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
            }
            delete board.tasks[args.task_id]
            await mgr.saveBoard(board)
            await mgr.deleteMarkdown(args.task_id)
            notifyStateChanged('tasks')
            return ok({ id: args.task_id })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'move_task',
        'Move a task to a different column on the kanban board.',
        {
          task_id: z.string().describe('The ID of the task to move'),
          column: columnEnum.describe('The target column')
        },
        async (args) => {
          notify('move_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const column = args.column as ColumnId
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            for (const col of VALID_COLUMNS) {
              board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
            }
            board.columns[column].push(args.task_id)
            await mgr.saveBoard(board)
            notifyStateChanged('tasks')
            return ok({ id: args.task_id, column })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'list_tasks',
        'List all tasks on the kanban board, grouped by column.',
        {},
        async () => {
          notify('list_tasks', {})
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            const result: Record<string, { id: string; title: string }[]> = {}
            for (const col of VALID_COLUMNS) {
              result[col] = board.columns[col]
                .filter((id) => board.tasks[id])
                .map((id) => ({ id, title: board.tasks[id].title }))
            }
            return ok(result)
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'read_task',
        'Read the markdown content of a task.',
        {
          task_id: z.string().describe('The ID of the task to read')
        },
        async (args) => {
          notify('read_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            const markdown = await mgr.readMarkdown(args.task_id)
            return ok({ id: args.task_id, title: board.tasks[args.task_id].title, markdown })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      // ── Terminal tools ──
      tool(
        'spawn_terminal',
        'Open a new terminal tab in the Agents panel.',
        {
          name: z.string().optional().describe('Name for the terminal tab'),
          command: z.string().optional().describe('Optional command to run in the terminal')
        },
        async (args) => {
          notify('spawn_terminal', args as Record<string, unknown>)
          const terminalName = args.name || 'Terminal'
          notifyStateChanged('terminal', { name: terminalName, command: args.command || null })
          return ok({ name: terminalName, command: args.command || null })
        }
      ),

      tool(
        'send_to_agent',
        'Send a task to an AI coding agent (Claude Code or Codex) in a new terminal.',
        {
          task_id: z.string().describe('The task ID to send'),
          agent: z.enum(['claude-code', 'codex']).optional().describe('Which AI agent to use (default: claude-code)')
        },
        async (args) => {
          notify('send_to_agent', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(args.task_id)) {
              return fail(`Invalid task ID: ${args.task_id}`)
            }
            const agent = args.agent || 'claude-code'
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            const taskTitle = board.tasks[args.task_id].title
            const markdown = await mgr.readMarkdown(args.task_id)
            const escaped = markdown.replace(/'/g, "'\\''")
            const cmd =
              agent === 'claude-code'
                ? `claude -p '${escaped}'`
                : `codex -q '${escaped}'`
            const tabName = `${agent === 'claude-code' ? 'Claude' : 'Codex'}: ${taskTitle}`
            notifyStateChanged('terminal', { name: tabName, command: cmd })
            return ok({ taskId: args.task_id, agent, tabName })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      // ── File tools ──
      tool(
        'read_file',
        'Read the contents of a file. Path is relative to the project root.',
        {
          path: z.string().describe('Relative file path from project root')
        },
        async (args) => {
          notify('read_file', args as Record<string, unknown>)
          try {
            const folder = requireFolder()
            const absPath = await validatePath(args.path, folder)
            const content = await readFile(absPath, 'utf-8')
            return ok({ path: args.path, content })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'write_file',
        'Write content to a file. Creates parent directories if needed. Path is relative to the project root.',
        {
          path: z.string().describe('Relative file path from project root'),
          content: z.string().describe('The content to write')
        },
        async (args) => {
          notify('write_file', args as Record<string, unknown>)
          try {
            const folder = requireFolder()
            const absPath = await validatePath(args.path, folder)
            await mkdir(dirname(absPath), { recursive: true })
            await writeFile(absPath, args.content, 'utf-8')
            notifyStateChanged('files')
            return ok({ path: args.path })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'list_files',
        'List files in a directory. Path is relative to the project root. Defaults to root if no path given.',
        {
          path: z.string().optional().describe('Relative directory path (default: project root)')
        },
        async (args) => {
          notify('list_files', args as Record<string, unknown>)
          try {
            const folder = requireFolder()
            const dirPath = args.path || '.'
            const absPath = await validatePath(dirPath, folder)
            const entries = await readdir(absPath, { withFileTypes: true })
            const files: { name: string; isDirectory: boolean; size?: number }[] = []
            for (const entry of entries) {
              if (IGNORED_NAMES.has(entry.name)) continue
              if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') continue
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
      ),

      tool(
        'delete_file',
        'Delete a file. Path is relative to the project root.',
        {
          path: z.string().describe('Relative file path from project root')
        },
        async (args) => {
          notify('delete_file', args as Record<string, unknown>)
          try {
            const folder = requireFolder()
            const absPath = await validatePath(args.path, folder)
            await unlink(absPath)
            notifyStateChanged('files')
            return ok({ path: args.path })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      // ── Git tools ──
      tool(
        'create_save_point',
        'Create a git save point (commit) with a message.',
        {
          message: z.string().describe('The save point message')
        },
        async (args) => {
          notify('create_save_point', args as Record<string, unknown>)
          try {
            const git = requireGitManager()
            const isRepo = await git.isRepo()
            if (!isRepo) return fail('Not a git repository. Initialize one first from the History tab.')
            const hash = await git.createSavePoint(args.message)
            notifyStateChanged('history')
            return ok({ hash: hash || '(no changes to commit)' })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'list_save_points',
        'List recent git save points (commits).',
        {
          limit: z.number().optional().describe('Maximum number of save points to return (default: 10)')
        },
        async (args) => {
          notify('list_save_points', args as Record<string, unknown>)
          try {
            const git = requireGitManager()
            const isRepo = await git.isRepo()
            if (!isRepo) return fail('Not a git repository')
            const history = await git.getHistory(args.limit || 10)
            return ok(history)
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'restore_save_point',
        'Restore the project to a specific save point. This is destructive — all uncommitted changes will be lost.',
        {
          hash: z.string().describe('The save point hash to restore to')
        },
        async (args) => {
          notify('restore_save_point', args as Record<string, unknown>)
          try {
            const git = requireGitManager()
            await git.restore(args.hash)
            notifyStateChanged('history')
            notifyStateChanged('files')
            return ok({ hash: args.hash })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'revert_save_point',
        'Revert a specific save point, undoing its changes while keeping history.',
        {
          hash: z.string().describe('The save point hash to revert')
        },
        async (args) => {
          notify('revert_save_point', args as Record<string, unknown>)
          try {
            const git = requireGitManager()
            await git.revert(args.hash)
            notifyStateChanged('history')
            notifyStateChanged('files')
            return ok({ hash: args.hash })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'get_changes',
        'Get the current uncommitted changes (git status).',
        {},
        async () => {
          notify('get_changes', {})
          try {
            const git = requireGitManager()
            const isRepo = await git.isRepo()
            if (!isRepo) return fail('Not a git repository')
            const status = await git.getStatus()
            return ok(status)
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      )
    ]
  })
}
