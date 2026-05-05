/**
 * HTTP MCP server that exposes Orchestrate tools to CLI agents.
 * Binds to 127.0.0.1 only — no external access.
 * Mutating tools are protected by a per-process secret.
 */
import crypto from 'crypto'
import { createServer, type Server as HttpServer, type IncomingMessage } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  getParseErrorMessage,
  normalizeObjectSchema,
  safeParseAsync
} from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ToolExecutorDeps } from './tool-handlers'
import type { McpConnectionManager } from './mcp-connection-manager'

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
const MAX_MCP_BODY_BYTES = 4 * 1024 * 1024

interface McpRequestContext {
  projectFolder?: string
  taskId?: string
}

interface RegisteredMcpTool {
  title?: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  annotations?: Tool['annotations']
  execution?: Tool['execution']
  _meta?: Record<string, unknown>
  enabled?: boolean
  handler: RegisteredMcpToolHandler
}

type RegisteredMcpToolHandler = (
  args?: unknown,
  extra?: unknown
) => CallToolResult | Promise<CallToolResult>
type McpToolHandler = (args: never, extra?: never) => CallToolResult | Promise<CallToolResult>

const EMPTY_OBJECT_JSON_SCHEMA: Tool['inputSchema'] = { type: 'object', properties: {} }
const registeredToolRegistry = new WeakMap<McpServer, Map<string, RegisteredMcpTool>>()

function getRegisteredTools(server: McpServer): Map<string, RegisteredMcpTool> {
  let tools = registeredToolRegistry.get(server)
  if (!tools) {
    tools = new Map()
    registeredToolRegistry.set(server, tools)
  }
  return tools
}

function registerTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchemaOrHandler: Record<string, unknown> | McpToolHandler,
  handler?: McpToolHandler
): void {
  const inputSchema = typeof inputSchemaOrHandler === 'function' ? undefined : inputSchemaOrHandler
  const actualHandler = typeof inputSchemaOrHandler === 'function' ? inputSchemaOrHandler : handler
  if (!actualHandler) throw new Error(`Missing MCP tool handler for ${name}`)

  getRegisteredTools(server).set(name, {
    description,
    inputSchema,
    handler: actualHandler as RegisteredMcpToolHandler
  })

  const tool = server.tool.bind(server) as (...args: unknown[]) => unknown
  if (inputSchema) tool(name, description, inputSchema, actualHandler)
  else tool(name, description, actualHandler)
}

function schemaToJsonSchema(schema: unknown): Tool['inputSchema'] {
  const normalized = normalizeObjectSchema(schema as never)
  if (!normalized) return EMPTY_OBJECT_JSON_SCHEMA
  return toJsonSchemaCompat(normalized, {
    strictUnions: true,
    pipeStrategy: 'input'
  }) as Tool['inputSchema']
}

function registeredToolToDefinition(name: string, tool: RegisteredMcpTool): Tool {
  const definition: Tool = {
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: schemaToJsonSchema(tool.inputSchema),
    annotations: tool.annotations,
    execution: tool.execution,
    _meta: tool._meta
  }
  if (tool.outputSchema) {
    definition.outputSchema = schemaToJsonSchema(tool.outputSchema)
  }
  return definition
}

async function parseToolArguments(tool: RegisteredMcpTool, args: unknown): Promise<unknown> {
  const schema = normalizeObjectSchema(tool.inputSchema as never)
  if (!schema) return args && typeof args === 'object' ? args : {}
  const result = await safeParseAsync(schema, args ?? {})
  if (!result.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid tool arguments: ${getParseErrorMessage(result.error)}`
    )
  }
  return result.data
}

function installAggregatedToolHandlers(
  server: McpServer,
  opts: {
    getProjectFolder: () => string | null
    getMcpConnectionManager: () => McpConnectionManager | null
  }
): void {
  server.server.setRequestHandler(ListToolsRequestSchema, async () => {
    const firstPartyTools = Array.from(getRegisteredTools(server).entries())
      .filter(([, tool]) => tool.enabled !== false)
      .map(([name, tool]) => registeredToolToDefinition(name, tool))

    const mcpManager = opts.getMcpConnectionManager()
    let upstreamTools: Tool[] = []
    if (mcpManager) {
      try {
        upstreamTools = await mcpManager.listTools(opts.getProjectFolder())
      } catch (err) {
        console.error('[MCP] Failed to list upstream MCP tools:', err)
      }
    }

    return { tools: [...firstPartyTools, ...upstreamTools] }
  })

  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = getRegisteredTools(server).get(request.params.name)
    if (tool && tool.enabled !== false) {
      const parsedArgs = await parseToolArguments(tool, request.params.arguments)
      return tool.handler(parsedArgs, extra)
    }

    const mcpManager = opts.getMcpConnectionManager()
    if (mcpManager) {
      return (await mcpManager.callTool(
        opts.getProjectFolder(),
        request.params.name,
        request.params.arguments ?? {}
      )) as CallToolResult
    }

    throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`)
  })
}

/** Read and JSON-parse the request body from an IncomingMessage */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > MAX_MCP_BODY_BYTES) {
        reject(new Error('MCP request body too large'))
        req.destroy()
        return
      }
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

function writeJsonRpcError(
  res: import('http').ServerResponse,
  statusCode: number,
  code: number,
  message: string
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

/** Create a fresh McpServer with all tool registrations */
function createMcpInstance(deps: ToolExecutorDeps, context: McpRequestContext = {}): McpServer {
  const {
    getCurrentFolder,
    getTaskManager,
    getTaskManagerForProject,
    getGitManager,
    getGitManagerForProject,
    getSkillManager,
    notifyStateChanged
  } = deps

  const scopedProjectFolder = context.projectFolder
  const scopedGetCurrentFolder = (): string | null => scopedProjectFolder ?? getCurrentFolder()
  const scopedNotifyStateChanged = (domain: string, data?: unknown): void => {
    const payload =
      data && typeof data === 'object' && !Array.isArray(data)
        ? { projectFolder: scopedProjectFolder, taskId: context.taskId, ...data }
        : scopedProjectFolder || context.taskId
          ? { value: data, projectFolder: scopedProjectFolder, taskId: context.taskId }
          : data
    notifyStateChanged(domain, payload)
  }

  const taskDeps = {
    getTaskManager: () =>
      scopedProjectFolder ? getTaskManagerForProject(scopedProjectFolder) : getTaskManager(),
    notifyStateChanged: scopedNotifyStateChanged
  }
  const gitDeps = {
    getGitManager: () =>
      scopedProjectFolder ? getGitManagerForProject(scopedProjectFolder) : getGitManager(),
    notifyStateChanged: scopedNotifyStateChanged
  }
  const fileDeps = {
    getCurrentFolder: scopedGetCurrentFolder,
    notifyStateChanged: scopedNotifyStateChanged
  }
  const skillDeps = { getSkillManager, getCurrentFolder: scopedGetCurrentFolder }
  const termDeps = { notifyStateChanged: scopedNotifyStateChanged }

  const server = new McpServer(
    { name: 'orchestrate', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  // ── Task tools ──

  const taskScheduleSchema = z
    .object({
      enabled: z.boolean().default(true).describe('Whether the schedule is enabled'),
      cron: z.string().describe('Cron expression, e.g. 0 10 * * *')
    })
    .optional()

  registerTool(
    server,
    'create_task',
    'Create a simple task with one prompt, mode, branch, agent, and optional schedule.',
    {
      prompt: z.string().optional().describe('Task prompt'),
      title: z.string().optional().describe('Legacy alias for prompt'),
      mode: z.enum(['plan', 'build']).optional().describe('Task mode (default: build)'),
      branch: z.string().optional().describe('Branch to run the task in'),
      branchName: z.string().optional().describe('Branch to run the task in'),
      agent: z.string().optional().describe('Agent ID (default: claude-code)'),
      pinned: z.boolean().optional().describe('Whether the task is pinned to the top'),
      schedule: taskScheduleSchema.describe('Optional schedule')
    },
    async (args) => handleCreateTask(args, taskDeps)
  )

  registerTool(
    server,
    'read_task',
    'Read a simple task.',
    { task_id: z.string().describe('The task ID') },
    async (args) => handleReadTask(args, taskDeps)
  )

  registerTool(
    server,
    'list_tasks',
    'List all simple tasks grouped by manual and scheduled.',
    async () => handleListTasks(taskDeps)
  )

  registerTool(
    server,
    'move_task',
    'Legacy alias: update a task status using an old kanban column name.',
    {
      task_id: z.string().describe('The task ID'),
      column: z.enum(['planning', 'in-progress', 'review', 'done']).describe('Target column')
    },
    async (args) => handleMoveTask(args, taskDeps)
  )

  registerTool(
    server,
    'edit_task',
    'Edit a simple task prompt, mode, branch, agent, pin state, schedule, or status.',
    {
      task_id: z.string().describe('The task ID'),
      prompt: z.string().optional().describe('New prompt'),
      title: z.string().optional().describe('Legacy alias for prompt'),
      content: z.string().optional().describe('Legacy alias for prompt'),
      mode: z.enum(['plan', 'build']).optional().describe('Task mode'),
      branch: z.string().optional().describe('Branch to run the task in'),
      branchName: z.string().optional().describe('Branch to run the task in'),
      agent: z.string().optional().describe('Agent ID'),
      pinned: z.boolean().optional().describe('Whether the task is pinned to the top'),
      schedule: taskScheduleSchema.nullable().optional().describe('Schedule or null to remove'),
      status: z
        .enum(['todo', 'running', 'review', 'done', 'failed'])
        .optional()
        .describe('Task status')
    },
    async (args) => handleEditTask(args, taskDeps)
  )

  registerTool(
    server,
    'delete_task',
    'Delete a simple task.',
    { task_id: z.string().describe('The task ID to delete') },
    async (args) => handleDeleteTask(args, taskDeps)
  )

  registerTool(
    server,
    'send_to_agent',
    'Start a simple task with an AI agent.',
    {
      task_id: z.string().describe('The task ID'),
      agent: z.string().optional().describe('Agent ID (defaults to the task agent)')
    },
    async (args) => handleSendToAgent(args, taskDeps)
  )

  registerTool(
    server,
    'trigger_task',
    'Legacy alias: start a simple task.',
    { task_id: z.string().describe('The ID of the task to trigger') },
    async (args) => handleTriggerTask(args, taskDeps)
  )

  // ── Terminal tools ──

  registerTool(
    server,
    'spawn_terminal',
    'Open a new terminal tab in the Agents panel.',
    {
      name: z.string().optional().describe('Name for the terminal tab'),
      command: z.string().optional().describe('Optional command to run in the terminal')
    },
    async (args) => handleSpawnTerminal(args, termDeps)
  )

  // ── File tools ──

  registerTool(
    server,
    'read_file',
    'Read the contents of a file. Path is relative to the project root.',
    { path: z.string().describe('Relative file path from project root') },
    async (args) => handleReadFile(args, fileDeps)
  )

  registerTool(
    server,
    'write_file',
    'Write content to a file. Creates parent directories if needed. Path is relative to the project root.',
    {
      path: z.string().describe('Relative file path from project root'),
      content: z.string().describe('The content to write')
    },
    async (args) => handleWriteFile(args, fileDeps)
  )

  registerTool(
    server,
    'list_files',
    'List files in a directory. Path is relative to the project root. Defaults to root if no path given.',
    {
      path: z.string().optional().describe('Relative directory path (default: project root)')
    },
    async (args) => handleListFiles(args, fileDeps)
  )

  registerTool(
    server,
    'delete_file',
    'Delete a file. Path is relative to the project root.',
    { path: z.string().describe('Relative file path from project root') },
    async (args) => handleDeleteFile(args, fileDeps)
  )

  // ── Git tools ──

  registerTool(
    server,
    'create_save_point',
    'Create a git save point (commit) with a message.',
    { message: z.string().describe('The save point message') },
    async (args) => handleCreateSavePoint(args, gitDeps)
  )

  registerTool(
    server,
    'list_save_points',
    'List recent git save points (commits).',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Maximum number of save points to return (1-100, default: 10)')
    },
    async (args) => handleListSavePoints(args, gitDeps)
  )

  registerTool(
    server,
    'restore_save_point',
    'Restore the project to a specific save point. This is destructive — all uncommitted changes will be lost.',
    { hash: z.string().describe('The save point hash to restore to') },
    async (args) => handleRestoreSavePoint(args, gitDeps)
  )

  registerTool(
    server,
    'revert_save_point',
    'Revert a specific save point, undoing its changes while keeping history.',
    { hash: z.string().describe('The save point hash to revert') },
    async (args) => handleRevertSavePoint(args, gitDeps)
  )

  registerTool(
    server,
    'get_changes',
    'Get the current uncommitted changes (git status).',
    async () => handleGetChanges(gitDeps)
  )

  // ── Skill tools ──

  registerTool(
    server,
    'activate_skill',
    'Load the full instructions of an agent skill by name. Use this when a task matches an available skill.',
    { name: z.string().describe('The skill name to activate') },
    async (args) => handleActivateSkill(args, skillDeps)
  )

  installAggregatedToolHandlers(server, {
    getProjectFolder: scopedGetCurrentFolder,
    getMcpConnectionManager: deps.getMcpConnectionManager
  })

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
      res.end(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Forbidden' }, id: null })
      )
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
          const projectHeader = req.headers['x-orchestrate-project']
          const taskHeader = req.headers['x-orchestrate-task']
          const projectHeaderValue =
            typeof projectHeader === 'string' && projectHeader.trim()
              ? projectHeader.trim()
              : undefined
          const scopedProjectFolder = projectHeaderValue
            ? deps.resolveProjectFolder(projectHeaderValue)
            : undefined
          if (projectHeaderValue && !scopedProjectFolder) {
            console.warn(
              '[MCP] Rejecting initialization for unregistered project:',
              projectHeaderValue
            )
            writeJsonRpcError(res, 400, -32000, 'Invalid project scope')
            return
          }
          const server = createMcpInstance(deps, {
            projectFolder: scopedProjectFolder ?? undefined,
            taskId:
              typeof taskHeader === 'string' && taskHeader.trim() ? taskHeader.trim() : undefined
          })
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
