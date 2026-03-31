/**
 * HTTP MCP server that exposes a subset of Orchestrate tools to CLI agents.
 * Binds to 127.0.0.1 only — no external access.
 */
import { createServer, type Server as HttpServer, type IncomingMessage } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ToolExecutorDeps } from './tools'
import {
  handleReadTask,
  handleListTasks,
  handleMoveTask,
  handleEditTask,
  handleCreateSavePoint,
  handleGetChanges
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
  const { getTaskManager, getGitManager, notifyStateChanged } = deps
  const taskDeps = { getTaskManager, notifyStateChanged }
  const gitDeps = { getGitManager, notifyStateChanged }

  const server = new McpServer(
    { name: 'orchestrate', version: '1.0.0' },
    { capabilities: { tools: {} } }
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
    'create_save_point',
    'Create a git save point (commit) with a message.',
    { message: z.string().describe('The save point message') },
    async (args) => handleCreateSavePoint(args, gitDeps)
  )

  server.tool('get_changes', 'Get the current uncommitted changes (git status).', async () =>
    handleGetChanges(gitDeps)
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
                s.close()
                servers.delete(sid)
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
            await s.close()
            servers.delete(sessionId)
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
