import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { BrowserWindow } from 'electron'
import type { TaskManager } from '../task-manager'
import type { LoopManager } from '../loop-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'
import { readFile, writeFile, unlink, readdir, stat, mkdir, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, resolve, relative, parse as pathParse } from 'path'
import type { SkillManager } from '../skill-manager'

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

async function validatePath(filePath: string, projectFolder: string): Promise<string> {
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

// ── Deps interface ──

export interface ToolExecutorDeps {
  getCurrentFolder: () => string | null
  getTaskManager: () => TaskManager | null
  getLoopManager: () => LoopManager | null
  getGitManager: () => GitManager | null
  getPtyManager: () => PtyManager | null
  getSkillManager: () => SkillManager | null
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
  'create_task',
  'edit_task',
  'delete_task',
  'move_task',
  'list_tasks',
  'read_task',
  'send_to_agent',
  'list_loops',
  'create_loop',
  'trigger_loop',
  'spawn_terminal',
  'read_file',
  'write_file',
  'list_files',
  'delete_file',
  'create_save_point',
  'list_save_points',
  'restore_save_point',
  'revert_save_point',
  'get_changes',
  'activate_skill'
] as const

export function createOrchestrateServer(deps: ToolExecutorDeps) {
  const {
    getCurrentFolder,
    getTaskManager,
    getLoopManager,
    getGitManager,
    getSkillManager,
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

  function requireLoopManager(): LoopManager {
    const mgr = getLoopManager()
    if (!mgr) throw new Error('Loop manager not available')
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

  return createSdkMcpServer({
    name: 'orchestrate',
    version: '1.0.0',
    tools: [
      // ── Task tools ──
      tool(
        'create_task',
        'Create a new task on the kanban board.',
        {
          title: z.string().describe('Task title'),
          column: z
            .enum(['planning', 'in-progress', 'review', 'done'])
            .optional()
            .describe('Column to place the task in (default: planning)')
        },
        async (args) => {
          notify('create_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
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
            notifyStateChanged('tasks')
            return ok({ id, title: args.title, column: col })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'edit_task',
        'Edit a task title or markdown content.',
        {
          task_id: z.string().describe('The task ID'),
          title: z.string().optional().describe('New title'),
          content: z.string().optional().describe('New markdown content')
        },
        async (args) => {
          notify('edit_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            if (args.title) {
              board.tasks[args.task_id].title = args.title
              await mgr.saveBoard(board)
            }
            if (args.content !== undefined) {
              await mgr.writeMarkdown(args.task_id, args.content)
            }
            notifyStateChanged('tasks')
            return ok({ id: args.task_id })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'delete_task',
        'Delete a task from the board.',
        {
          task_id: z.string().describe('The task ID to delete')
        },
        async (args) => {
          notify('delete_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            // Remove from columns
            for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
              board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
            }
            const taskMeta = board.tasks[args.task_id]
            delete board.tasks[args.task_id]
            await mgr.saveBoard(board)
            if (taskMeta.type === 'task') {
              await mgr.deleteMarkdown(args.task_id)
            }
            notifyStateChanged('tasks')
            return ok({ id: args.task_id })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'move_task',
        'Move a task to a different column on the board.',
        {
          task_id: z.string().describe('The task ID'),
          column: z.enum(['planning', 'in-progress', 'review', 'done']).describe('Target column')
        },
        async (args) => {
          notify('move_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            // Remove from current column
            for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
              board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
            }
            board.columns[args.column].push(args.task_id)
            await mgr.saveBoard(board)
            notifyStateChanged('tasks')
            return ok({ id: args.task_id, column: args.column })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool('list_tasks', 'List all tasks on the kanban board.', {}, async () => {
        notify('list_tasks', {})
        try {
          const mgr = requireTaskManager()
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
      }),

      tool(
        'read_task',
        'Read the markdown content of a task.',
        {
          task_id: z.string().describe('The task ID')
        },
        async (args) => {
          notify('read_task', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            const content = await mgr.readMarkdown(args.task_id)
            return ok({ id: args.task_id, title: board.tasks[args.task_id].title, content })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'send_to_agent',
        'Send a task to be executed by an AI agent (Claude Code or Codex).',
        {
          task_id: z.string().describe('The task ID'),
          agent: z.enum(['claude-code', 'codex']).optional().describe('Agent type (default: claude-code)')
        },
        async (args) => {
          notify('send_to_agent', args as Record<string, unknown>)
          try {
            const mgr = requireTaskManager()
            const board = await mgr.loadBoard()
            if (!board.tasks[args.task_id]) return fail(`Task ${args.task_id} not found`)
            const agent = args.agent || 'claude-code'
            // Move to in-progress
            for (const col of Object.keys(board.columns) as Array<keyof typeof board.columns>) {
              board.columns[col] = board.columns[col].filter((id) => id !== args.task_id)
            }
            board.columns['in-progress'].unshift(args.task_id)
            await mgr.saveBoard(board)
            // Notify renderer to create terminal and run
            notifyStateChanged('task-agent', { taskId: args.task_id, agent })
            notifyStateChanged('tasks')
            return ok({ id: args.task_id, agent })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      // ── Loop tools ──
      tool('list_loops', 'List all loops.', {}, async () => {
        notify('list_loops', {})
        try {
          const mgr = requireLoopManager()
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
      }),

      tool(
        'create_loop',
        'Create a new loop with ordered steps.',
        {
          name: z.string().describe('The name of the loop'),
          steps: z
            .array(z.string())
            .describe('Ordered list of step prompts'),
          agent_type: z
            .enum(['claude-code', 'codex'])
            .optional()
            .describe('Which AI agent to use (default: claude-code)'),
          cron: z
            .string()
            .optional()
            .describe('Cron schedule expression (e.g. "0 9 * * 1-5")')
        },
        async (args) => {
          notify('create_loop', args as Record<string, unknown>)
          try {
            const mgr = requireLoopManager()
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
              const taskMgr = getTaskManager()
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
                notifyStateChanged('tasks')
              }
            } catch (boardErr) {
              console.warn('[Tools] Failed to add loop to board:', boardErr)
            }
            notifyStateChanged('loops')
            return ok({ id, name: args.name, stepCount: loop.steps.length })
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      ),

      tool(
        'trigger_loop',
        'Trigger a loop to start executing its steps sequentially.',
        {
          loop_id: z.string().describe('The ID of the loop to trigger')
        },
        async (args) => {
          notify('trigger_loop', args as Record<string, unknown>)
          try {
            const mgr = requireLoopManager()
            const loop = await mgr.loadLoop(args.loop_id)
            if (!loop) return fail(`Loop ${args.loop_id} not found`)
            if (!loop.steps || loop.steps.length === 0) {
              return fail(`Loop ${args.loop_id} has no steps`)
            }
            // Send trigger to renderer to execute
            notifyStateChanged('loop-trigger', { loopId: args.loop_id })
            return ok({ loopId: args.loop_id, name: loop.name })
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
              if (
                entry.name.startsWith('.') &&
                entry.name !== '.env' &&
                entry.name !== '.gitignore'
              )
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
            if (!isRepo)
              return fail('Not a git repository. Initialize one first from the History tab.')
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
          limit: z
            .number()
            .optional()
            .describe('Maximum number of save points to return (default: 10)')
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

      tool('get_changes', 'Get the current uncommitted changes (git status).', {}, async () => {
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
      }),

      // ── Skill tools ──
      tool(
        'activate_skill',
        'Load the full instructions of an agent skill by name. Use this when a task matches an available skill.',
        {
          name: z.string().describe('The skill name to activate')
        },
        async (args) => {
          notify('activate_skill', args as Record<string, unknown>)
          try {
            const mgr = getSkillManager()
            if (!mgr) return fail('Skill manager not available')
            const folder = getCurrentFolder()
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
      )
    ]
  })
}
