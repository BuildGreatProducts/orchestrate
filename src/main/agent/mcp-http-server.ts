/**
 * HTTP MCP server that exposes Orchestrate tools to CLI agents.
 * Binds to 127.0.0.1 only — no external access.
 * Mutating tools are protected by a per-process secret.
 */
import crypto from 'crypto'
import { createServer, type Server as HttpServer, type IncomingMessage } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ToolExecutorDeps } from './tool-handlers'

// Per-process secret for authenticating mutating tool requests
const MCP_SECRET = process.env.MCP_SECRET || crypto.randomBytes(32).toString('hex')

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** Get the MCP secret for passing to CLI agents via config */
export function getMcpSecret(): string {
  return MCP_SECRET
}
import {
  handleCreateTask,
  handleReadTask,
  handleListTasks,
  handleMoveTask,
  handleEditTask,
  handleDeleteTask,
  handleSendToAgent,
  handleTriggerTask,
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

let httpServer: HttpServer | null = null
let serverPort: number | null = null

/** Read and JSON-parse the request body from an IncomingMessage */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/** Create a fresh McpServer with all tool registrations */
function createMcpInstance(deps: ToolExecutorDeps): McpServer {
  const {
    getCurrentFolder,
    getTaskManager,
    getGitManager,
    getSkillManager,
    notifyStateChanged
  } = deps

  const taskDeps = { getTaskManager, notifyStateChanged }
  const gitDeps = { getGitManager, notifyStateChanged }
  const fileDeps = { getCurrentFolder, notifyStateChanged }
  const skillDeps = { getSkillManager, getCurrentFolder }
  const termDeps = { notifyStateChanged }

  const server = new McpServer(
    { name: 'orchestrate', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  // ── Task tools ──

  server.tool(
    'create_task',
    'Create a new task on the kanban board, optionally with ordered steps.',
    {
      title: z.string().describe('Task title'),
      column: z
        .enum(['planning', 'in-progress', 'review', 'done'])
        .optional()
        .describe('Column to place the task in (default: planning)'),
      steps: z.array(z.string()).optional().describe('Ordered list of step prompts for multi-step tasks')
    },
    async (args) => handleCreateTask(args, taskDeps)
  )

  server.tool(
    'read_task',
    'Read the markdown content of a task.',
    { task_id: z.string().describe('The task ID') },
    async (args) => handleReadTask(args, taskDeps)
  )

  server.tool('list_tasks', 'List all tasks on the kanban board.', async () =>
    handleListTasks(taskDeps)
  )

  server.tool(
    'move_task',
    'Move a task to a different column on the board.',
    {
      task_id: z.string().describe('The task ID'),
      column: z.enum(['planning', 'in-progress', 'review', 'done']).describe('Target column')
    },
    async (args) => handleMoveTask(args, taskDeps)
  )

  server.tool(
    'edit_task',
    'Edit a task title or markdown content.',
    {
      task_id: z.string().describe('The task ID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content')
    },
    async (args) => handleEditTask(args, taskDeps)
  )

  server.tool(
    'delete_task',
    'Delete a task from the board.',
    { task_id: z.string().describe('The task ID to delete') },
    async (args) => handleDeleteTask(args, taskDeps)
  )

  server.tool(
    'send_to_agent',
    'Send a task to be executed by an AI agent (Claude Code or Codex).',
    {
      task_id: z.string().describe('The task ID'),
      agent: z
        .enum(['claude-code', 'codex'])
        .optional()
        .describe('Agent type (default: claude-code)')
    },
    async (args) => handleSendToAgent(args, taskDeps)
  )

  server.tool(
    'trigger_task',
    'Trigger a multi-step task to start executing its steps sequentially. Returns an error if the task has no steps.',
    { task_id: z.string().describe('The ID of the task to trigger') },
    async (args) => handleTriggerTask(args, taskDeps)
  )

  // ── Terminal tools ──

  server.tool(
    'spawn_terminal',
    'Open a new terminal tab in the Agents panel.',
    {
      name: z.string().optional().describe('Name for the terminal tab'),
      command: z.string().optional().describe('Optional command to run in the terminal')
    },
    async (args) => handleSpawnTerminal(args, termDeps)
  )

  // ── File tools ──

  server.tool(
    'read_file',
    'Read the contents of a file. Path is relative to the project root.',
    { path: z.string().describe('Relative file path from project root') },
    async (args) => handleReadFile(args, fileDeps)
  )

  server.tool(
    'write_file',
    'Write content to a file. Creates parent directories if needed. Path is relative to the project root.',
    {
      path: z.string().describe('Relative file path from project root'),
      content: z.string().describe('The content to write')
    },
    async (args) => handleWriteFile(args, fileDeps)
  )

  server.tool(
    'list_files',
    'List files in a directory. Path is relative to the project root. Defaults to root if no path given.',
    {
      path: z.string().optional().describe('Relative directory path (default: project root)')
    },
    async (args) => handleListFiles(args, fileDeps)
  )

  server.tool(
    'delete_file',
    'Delete a file. Path is relative to the project root.',
    { path: z.string().describe('Relative file path from project root') },
    async (args) => handleDeleteFile(args, fileDeps)
  )

  // ── Git tools ──

  server.tool(
    'create_save_point',
    'Create a git save point (commit) with a message.',
    { message: z.string().describe('The save point message') },
    async (args) => handleCreateSavePoint(args, gitDeps)
  )

  server.tool(
    'list_save_points',
    'List recent git save points (commits).',
    {
      limit: z
        .number()
        .optional()
        .describe('Maximum number of save points to return (default: 10)')
    },
    async (args) => handleListSavePoints(args, gitDeps)
  )

  server.tool(
    'restore_save_point',
    'Restore the project to a specific save point. This is destructive — all uncommitted changes will be lost.',
    { hash: z.string().describe('The save point hash to restore to') },
    async (args) => handleRestoreSavePoint(args, gitDeps)
  )

  server.tool(
    'revert_save_point',
    'Revert a specific save point, undoing its changes while keeping history.',
    { hash: z.string().describe('The save point hash to revert') },
    async (args) => handleRevertSavePoint(args, gitDeps)
  )

  server.tool('get_changes', 'Get the current uncommitted changes (git status).', async () =>
    handleGetChanges(gitDeps)
  )

  // ── Skill tools ──

  server.tool(
    'activate_skill',
    'Load the full instructions of an agent skill by name. Use this when a task matches an available skill.',
    { name: z.string().describe('The skill name to activate') },
    async (args) => handleActivateSkill(args, skillDeps)
  )

  return server
}

export async function startMcpServer(
  deps: ToolExecutorDeps
): Promise<{ port: number; close: () => Promise<void> }> {
  // Track transports by session ID and their associated MCP server instances
  const transports = new Map<string, StreamableHTTPServerTransport>()
  const servers = new Map<string, McpServer>()

  httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    if (url.pathname !== '/mcp') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    // Verify per-process secret on all requests
    const providedSecret = req.headers['x-mcp-secret'] as string | undefined
    if (!providedSecret || !constantTimeEqual(providedSecret, MCP_SECRET)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Forbidden' }, id: null }))
      return
    }

    try {
      if (req.method === 'POST') {
        const body = await readBody(req)
        const sessionId = req.headers['mcp-session-id'] as string | undefined

        if (sessionId && transports.has(sessionId)) {
          // Existing session
          const transport = transports.get(sessionId)!
          await transport.handleRequest(req, res, body)
        } else if (!sessionId && isInitializeRequest(body)) {
          // New initialization — create server + transport per session
          const server = createMcpInstance(deps)
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (sid) => {
              transports.set(sid, transport)
              servers.set(sid, server)
            }
          })

          transport.onclose = () => {
            const sid = transport.sessionId
            if (sid) {
              transports.delete(sid)
              const s = servers.get(sid)
              if (s) {
                // Delete before closing to prevent re-entrant recursion:
                // McpServer.close() -> transport.close() -> onclose -> here again
                servers.delete(sid)
                s.close().catch((err) => {
                  console.error(`[MCP] Error closing server for session ${sid}:`, err)
                })
              }
            }
          }

          await server.connect(transport)
          await transport.handleRequest(req, res, body)
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
              id: null
            })
          )
        }
      } else if (req.method === 'GET') {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!
          await transport.handleRequest(req, res)
        } else {
          res.writeHead(400)
          res.end('Session ID required for GET')
        }
      } else if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!
          await transport.handleRequest(req, res)
          transports.delete(sessionId)
          const s = servers.get(sessionId)
          if (s) {
            // Delete before closing to prevent re-entrant recursion
            servers.delete(sessionId)
            await s.close()
          }
        } else {
          res.writeHead(404)
          res.end('Session not found')
        }
      } else {
        res.writeHead(405)
        res.end('Method not allowed')
      }
    } catch (err) {
      console.error('[MCP] Request error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null
          })
        )
      }
    }
  })

  // Listen on localhost with OS-assigned port
  const port = await new Promise<number>((resolve, reject) => {
    httpServer!.listen(0, '127.0.0.1', () => {
      const addr = httpServer!.address()
      if (addr && typeof addr === 'object') {
        resolve(addr.port)
      } else {
        reject(new Error('Failed to get server address'))
      }
    })
    httpServer!.on('error', reject)
  })

  serverPort = port
  console.log(`[MCP] HTTP server listening on http://127.0.0.1:${port}/mcp`)

  const close = async (): Promise<void> => {
    for (const transport of transports.values()) {
      await transport.close?.()
    }
    transports.clear()

    for (const server of servers.values()) {
      await server.close()
    }
    servers.clear()

    await new Promise<void>((resolve) => {
      if (httpServer) {
        httpServer.close(() => resolve())
      } else {
        resolve()
      }
    })
    httpServer = null
    serverPort = null
    console.log('[MCP] HTTP server stopped')
  }

  return { port, close }
}

export function getMcpServerPort(): number | null {
  return serverPort
}

export function getMcpServerUrl(): string | null {
  if (serverPort === null) return null
  return `http://127.0.0.1:${serverPort}/mcp`
}
