import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import type { BrowserWindow } from 'electron'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises'
import { dirname, join, resolve, relative, sep } from 'path'
import type { ColumnId } from '@shared/types'

const VALID_COLUMNS: ColumnId[] = ['draft', 'planning', 'in-progress', 'review', 'done']

export const AGENT_TOOLS: Tool[] = [
  // Task tools
  {
    name: 'create_task',
    description: 'Create a new task on the kanban board in the specified column.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'The title of the task' },
        column: {
          type: 'string',
          enum: VALID_COLUMNS,
          description: 'The column to place the task in (default: draft)'
        },
        markdown: { type: 'string', description: 'Optional markdown content for the task' }
      },
      required: ['title']
    }
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task title.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The ID of the task to edit' },
        title: { type: 'string', description: 'The new title for the task' }
      },
      required: ['task_id', 'title']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task from the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The ID of the task to delete' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'move_task',
    description: 'Move a task to a different column on the kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The ID of the task to move' },
        column: {
          type: 'string',
          enum: VALID_COLUMNS,
          description: 'The target column'
        }
      },
      required: ['task_id', 'column']
    }
  },
  {
    name: 'list_tasks',
    description: 'List all tasks on the kanban board, grouped by column.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'read_task',
    description: 'Read the markdown content of a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The ID of the task to read' }
      },
      required: ['task_id']
    }
  },
  // Terminal tools
  {
    name: 'spawn_terminal',
    description: 'Open a new terminal tab in the Agents panel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for the terminal tab' },
        command: { type: 'string', description: 'Optional command to run in the terminal' }
      },
      required: []
    }
  },
  {
    name: 'send_to_agent',
    description: 'Send a task to an AI coding agent (Claude Code or Codex) in a new terminal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to send' },
        agent: {
          type: 'string',
          enum: ['claude-code', 'codex'],
          description: 'Which AI agent to use (default: claude-code)'
        }
      },
      required: ['task_id']
    }
  },
  // File tools
  {
    name: 'read_file',
    description: 'Read the contents of a file. Path is relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from project root' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if needed. Path is relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from project root' },
        content: { type: 'string', description: 'The content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_files',
    description: 'List files in a directory. Path is relative to the project root. Defaults to root if no path given.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative directory path (default: project root)' }
      },
      required: []
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file. Path is relative to the project root.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from project root' }
      },
      required: ['path']
    }
  },
  // Git tools
  {
    name: 'create_save_point',
    description: 'Create a git save point (commit) with a message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The save point message' }
      },
      required: ['message']
    }
  },
  {
    name: 'list_save_points',
    description: 'List recent git save points (commits).',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Maximum number of save points to return (default: 10)' }
      },
      required: []
    }
  },
  {
    name: 'restore_save_point',
    description: 'Restore the project to a specific save point. This is destructive — all uncommitted changes will be lost.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'The save point hash to restore to' }
      },
      required: ['hash']
    }
  },
  {
    name: 'revert_save_point',
    description: 'Revert a specific save point, undoing its changes while keeping history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'The save point hash to revert' }
      },
      required: ['hash']
    }
  },
  {
    name: 'get_changes',
    description: 'Get the current uncommitted changes (git status).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  }
]

// ── Path validation ──

const IGNORED_NAMES = new Set([
  'node_modules', '.git', '.DS_Store', '.Trash', 'thumbs.db',
  '.next', '.nuxt', 'dist', 'out', '.cache', '.turbo'
])

function validatePath(filePath: string, projectFolder: string): string {
  const resolved = resolve(projectFolder, filePath)
  const rel = relative(projectFolder, resolved)
  if (rel.startsWith('..') || rel.startsWith(sep)) {
    throw new Error('Path outside project folder')
  }
  return resolved
}

// ── Tool executor factory ──

interface ToolExecutorDeps {
  getCurrentFolder: () => string | null
  getTaskManager: () => TaskManager | null
  getGitManager: () => GitManager | null
  getPtyManager: () => PtyManager | null
  getWindow: () => BrowserWindow | null
  notifyToolUse: (tool: string, input: Record<string, unknown>) => void
  notifyStateChanged: (domain: string, data?: unknown) => void
}

export function createToolExecutor(deps: ToolExecutorDeps): (name: string, input: Record<string, unknown>) => Promise<unknown> {
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

  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    notifyToolUse(name, input)

    try {
      switch (name) {
        // ── Task tools ──
        case 'create_task': {
          const mgr = requireTaskManager()
          const title = input.title as string
          const column = (input.column as ColumnId) || 'draft'
          const markdown = input.markdown as string | undefined
          if (!VALID_COLUMNS.includes(column)) {
            return { success: false, error: `Invalid column: ${column}` }
          }
          const board = await mgr.loadBoard()
          const id = mgr.generateId()
          board.columns[column].push(id)
          board.tasks[id] = { title, createdAt: new Date().toISOString() }
          await mgr.saveBoard(board)
          await mgr.writeMarkdown(id, markdown || `# ${title}\n\n`)
          notifyStateChanged('tasks')
          return { success: true, data: { id, title, column } }
        }

        case 'edit_task': {
          const mgr = requireTaskManager()
          const taskId = input.task_id as string
          const title = input.title as string
          const board = await mgr.loadBoard()
          if (!board.tasks[taskId]) {
            return { success: false, error: `Task ${taskId} not found` }
          }
          board.tasks[taskId].title = title
          await mgr.saveBoard(board)
          notifyStateChanged('tasks')
          return { success: true, data: { id: taskId, title } }
        }

        case 'delete_task': {
          const mgr = requireTaskManager()
          const taskId = input.task_id as string
          const board = await mgr.loadBoard()
          if (!board.tasks[taskId]) {
            return { success: false, error: `Task ${taskId} not found` }
          }
          // Remove from columns
          for (const col of VALID_COLUMNS) {
            board.columns[col] = board.columns[col].filter((id) => id !== taskId)
          }
          delete board.tasks[taskId]
          await mgr.saveBoard(board)
          await mgr.deleteMarkdown(taskId)
          notifyStateChanged('tasks')
          return { success: true, data: { id: taskId } }
        }

        case 'move_task': {
          const mgr = requireTaskManager()
          const taskId = input.task_id as string
          const column = input.column as ColumnId
          if (!VALID_COLUMNS.includes(column)) {
            return { success: false, error: `Invalid column: ${column}` }
          }
          const board = await mgr.loadBoard()
          if (!board.tasks[taskId]) {
            return { success: false, error: `Task ${taskId} not found` }
          }
          // Remove from current column
          for (const col of VALID_COLUMNS) {
            board.columns[col] = board.columns[col].filter((id) => id !== taskId)
          }
          board.columns[column].push(taskId)
          await mgr.saveBoard(board)
          notifyStateChanged('tasks')
          return { success: true, data: { id: taskId, column } }
        }

        case 'list_tasks': {
          const mgr = requireTaskManager()
          const board = await mgr.loadBoard()
          const result: Record<string, { id: string; title: string }[]> = {}
          for (const col of VALID_COLUMNS) {
            result[col] = board.columns[col]
              .filter((id) => board.tasks[id])
              .map((id) => ({ id, title: board.tasks[id].title }))
          }
          return { success: true, data: result }
        }

        case 'read_task': {
          const mgr = requireTaskManager()
          const taskId = input.task_id as string
          const board = await mgr.loadBoard()
          if (!board.tasks[taskId]) {
            return { success: false, error: `Task ${taskId} not found` }
          }
          const markdown = await mgr.readMarkdown(taskId)
          return { success: true, data: { id: taskId, title: board.tasks[taskId].title, markdown } }
        }

        // ── Terminal tools ──
        case 'spawn_terminal': {
          const terminalName = (input.name as string) || 'Terminal'
          const command = input.command as string | undefined
          notifyStateChanged('terminal', { name: terminalName, command })
          return { success: true, data: { name: terminalName, command: command || null } }
        }

        case 'send_to_agent': {
          const mgr = requireTaskManager()
          const taskId = input.task_id as string
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) {
            return { success: false, error: `Invalid task ID: ${taskId}` }
          }
          const agent = (input.agent as string) || 'claude-code'
          const board = await mgr.loadBoard()
          if (!board.tasks[taskId]) {
            return { success: false, error: `Task ${taskId} not found` }
          }
          const taskTitle = board.tasks[taskId].title
          const markdown = await mgr.readMarkdown(taskId)
          const escaped = markdown.replace(/'/g, "'\\''")
          const cmd =
            agent === 'claude-code'
              ? `claude -p '${escaped}'`
              : `codex -q '${escaped}'`
          const tabName = `${agent === 'claude-code' ? 'Claude' : 'Codex'}: ${taskTitle}`
          notifyStateChanged('terminal', { name: tabName, command: cmd })
          return { success: true, data: { taskId, agent, tabName } }
        }

        // ── File tools ──
        case 'read_file': {
          const folder = requireFolder()
          const filePath = input.path as string
          const absPath = validatePath(filePath, folder)
          const content = await readFile(absPath, 'utf-8')
          return { success: true, data: { path: filePath, content } }
        }

        case 'write_file': {
          const folder = requireFolder()
          const filePath = input.path as string
          const content = input.content as string
          const absPath = validatePath(filePath, folder)
          // Ensure parent directory exists
          await mkdir(dirname(absPath), { recursive: true })
          await writeFile(absPath, content, 'utf-8')
          notifyStateChanged('files')
          return { success: true, data: { path: filePath } }
        }

        case 'list_files': {
          const folder = requireFolder()
          const dirPath = (input.path as string) || '.'
          const absPath = validatePath(dirPath, folder)
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
          return { success: true, data: { path: dirPath, files } }
        }

        case 'delete_file': {
          const folder = requireFolder()
          const filePath = input.path as string
          const absPath = validatePath(filePath, folder)
          await unlink(absPath)
          notifyStateChanged('files')
          return { success: true, data: { path: filePath } }
        }

        // ── Git tools ──
        case 'create_save_point': {
          const git = requireGitManager()
          const message = input.message as string
          const isRepo = await git.isRepo()
          if (!isRepo) {
            return { success: false, error: 'Not a git repository. Initialize one first from the History tab.' }
          }
          const hash = await git.createSavePoint(message)
          notifyStateChanged('history')
          return { success: true, data: { hash: hash || '(no changes to commit)' } }
        }

        case 'list_save_points': {
          const git = requireGitManager()
          const isRepo = await git.isRepo()
          if (!isRepo) {
            return { success: false, error: 'Not a git repository' }
          }
          const limit = (input.limit as number) || 10
          const history = await git.getHistory(limit)
          return { success: true, data: history }
        }

        case 'restore_save_point': {
          const git = requireGitManager()
          const hash = input.hash as string
          await git.restore(hash)
          notifyStateChanged('history')
          notifyStateChanged('files')
          return { success: true, data: { hash } }
        }

        case 'revert_save_point': {
          const git = requireGitManager()
          const hash = input.hash as string
          await git.revert(hash)
          notifyStateChanged('history')
          notifyStateChanged('files')
          return { success: true, data: { hash } }
        }

        case 'get_changes': {
          const git = requireGitManager()
          const isRepo = await git.isRepo()
          if (!isRepo) {
            return { success: false, error: 'Not a git repository' }
          }
          const status = await git.getStatus()
          return { success: true, data: status }
        }

        default:
          return { success: false, error: `Unknown tool: ${name}` }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }
}
