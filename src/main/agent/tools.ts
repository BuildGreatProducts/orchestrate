import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { BrowserWindow } from 'electron'
import type { TaskManager } from '../task-manager'
import type { LoopManager } from '../loop-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'
import type { SkillManager } from '../skill-manager'
import {
  handleCreateTask,
  handleReadTask,
  handleListTasks,
  handleMoveTask,
  handleEditTask,
  handleDeleteTask,
  handleSendToAgent,
  handleListLoops,
  handleCreateLoop,
  handleTriggerLoop,
  handleSpawnTerminal,
  handleReadFile,
  handleWriteFile,
  handleListFiles,
  handleDeleteFile,
  handleCreateSavePoint,
  handleListSavePoints,
  handleRestoreSavePoint,
  handleRevertSavePoint,
  handleGetChanges,
  handleActivateSkill
} from './tool-handlers'

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

  function notify(toolName: string, args: Record<string, unknown>): void {
    notifyToolUse(toolName, args)
  }

  const taskDeps = { getTaskManager, notifyStateChanged }
  const gitDeps = { getGitManager, notifyStateChanged }
  const loopDeps = { getLoopManager, getTaskManager, notifyStateChanged }
  const fileDeps = { getCurrentFolder, notifyStateChanged }
  const skillDeps = { getSkillManager, getCurrentFolder }
  const termDeps = { notifyStateChanged }

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
          return handleCreateTask(args, taskDeps)
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
          return handleEditTask(args, taskDeps)
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
          return handleDeleteTask(args, taskDeps)
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
          return handleMoveTask(args, taskDeps)
        }
      ),

      tool('list_tasks', 'List all tasks on the kanban board.', {}, async () => {
        notify('list_tasks', {})
        return handleListTasks(taskDeps)
      }),

      tool(
        'read_task',
        'Read the markdown content of a task.',
        {
          task_id: z.string().describe('The task ID')
        },
        async (args) => {
          notify('read_task', args as Record<string, unknown>)
          return handleReadTask(args, taskDeps)
        }
      ),

      tool(
        'send_to_agent',
        'Send a task to be executed by an AI agent (Claude Code or Codex).',
        {
          task_id: z.string().describe('The task ID'),
          agent: z
            .enum(['claude-code', 'codex'])
            .optional()
            .describe('Agent type (default: claude-code)')
        },
        async (args) => {
          notify('send_to_agent', args as Record<string, unknown>)
          return handleSendToAgent(args, taskDeps)
        }
      ),

      // ── Loop tools ──
      tool('list_loops', 'List all loops.', {}, async () => {
        notify('list_loops', {})
        return handleListLoops(loopDeps)
      }),

      tool(
        'create_loop',
        'Create a new loop with ordered steps.',
        {
          name: z.string().describe('The name of the loop'),
          steps: z.array(z.string()).describe('Ordered list of step prompts'),
          agent_type: z
            .enum(['claude-code', 'codex'])
            .optional()
            .describe('Which AI agent to use (default: claude-code)'),
          cron: z.string().optional().describe('Cron schedule expression (e.g. "0 9 * * 1-5")')
        },
        async (args) => {
          notify('create_loop', args as Record<string, unknown>)
          return handleCreateLoop(args, loopDeps)
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
          return handleTriggerLoop(args, loopDeps)
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
          return handleSpawnTerminal(args, termDeps)
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
          return handleReadFile(args, fileDeps)
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
          return handleWriteFile(args, fileDeps)
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
          return handleListFiles(args, fileDeps)
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
          return handleDeleteFile(args, fileDeps)
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
          return handleCreateSavePoint(args, gitDeps)
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
          return handleListSavePoints(args, gitDeps)
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
          return handleRestoreSavePoint(args, gitDeps)
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
          return handleRevertSavePoint(args, gitDeps)
        }
      ),

      tool('get_changes', 'Get the current uncommitted changes (git status).', {}, async () => {
        notify('get_changes', {})
        return handleGetChanges(gitDeps)
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
          return handleActivateSkill(args, skillDeps)
        }
      )
    ]
  })
}
