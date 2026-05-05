import { createServer, type Server as HttpServer } from 'http'
import { shell } from 'electron'
import { randomBytes } from 'crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  UnauthorizedError,
  type OAuthClientProvider
} from '@modelcontextprotocol/sdk/client/auth.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { EventSourceInit } from 'eventsource'
import type { McpConnectionStatus } from '@shared/types'
import { McpRegistryManager, type PersistedMcpServerConfig } from './mcp-registry-manager'

interface ActiveConnection {
  client: Client
  transport: Transport
  serverId: string
}

interface OAuthCallbackServer {
  redirectUrl: string
  waitForCode: () => Promise<string>
  close: () => Promise<void>
}

interface OAuthStateHolder {
  value?: string
}

class PersistentOAuthProvider implements OAuthClientProvider {
  clientMetadataUrl?: string
  private registry: McpRegistryManager
  private serverId: string
  private redirect: string
  private interactive: boolean
  private stateHolder?: OAuthStateHolder

  constructor(opts: {
    registry: McpRegistryManager
    serverId: string
    redirectUrl: string
    interactive: boolean
    stateHolder?: OAuthStateHolder
  }) {
    this.registry = opts.registry
    this.serverId = opts.serverId
    this.redirect = opts.redirectUrl
    this.interactive = opts.interactive
    this.stateHolder = opts.stateHolder
  }

  get redirectUrl(): string {
    return this.redirect
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Orchestrate',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.registry.getOAuthState(this.serverId).clientInformation as
      | OAuthClientInformationMixed
      | undefined
  }

  state(): string {
    if (!this.stateHolder) return randomBytes(16).toString('hex')
    if (!this.stateHolder.value) this.stateHolder.value = randomBytes(16).toString('hex')
    return this.stateHolder.value
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.registry.updateOAuthState(this.serverId, { clientInformation })
  }

  tokens(): OAuthTokens | undefined {
    return this.registry.getOAuthState(this.serverId).tokens as OAuthTokens | undefined
  }

  saveTokens(tokens: OAuthTokens): void {
    this.registry.updateOAuthState(this.serverId, { tokens })
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (this.interactive) {
      void shell.openExternal(authorizationUrl.toString())
    }
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.registry.updateOAuthState(this.serverId, { codeVerifier })
  }

  codeVerifier(): string {
    const verifier = this.registry.getOAuthState(this.serverId).codeVerifier
    if (!verifier) throw new Error('No OAuth code verifier saved')
    return verifier
  }
}

function status(
  serverId: string,
  state: McpConnectionStatus['state'],
  message?: string,
  toolCount?: number
): McpConnectionStatus {
  return {
    serverId,
    state,
    message,
    toolCount,
    checkedAt: new Date().toISOString()
  }
}

function toolName(server: PersistedMcpServerConfig, tool: Tool): string {
  return `${server.slug}__${tool.name}`
}

function originalToolName(server: PersistedMcpServerConfig, namespacedName: string): string | null {
  const prefix = `${server.slug}__`
  if (!namespacedName.startsWith(prefix)) return null
  return namespacedName.slice(prefix.length)
}

function withHeaders(headers: Record<string, string>): RequestInit {
  return { headers }
}

async function startOAuthCallbackServer(
  stateHolder: OAuthStateHolder
): Promise<OAuthCallbackServer> {
  let server: HttpServer | null = null
  let resolveCode: ((code: string) => void) | null = null
  let rejectCode: ((err: Error) => void) | null = null

  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const port = await new Promise<number>((resolve, reject) => {
    server = createServer((req, res) => {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1')
      if (parsed.pathname !== '/oauth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        return
      }
      const code = parsed.searchParams.get('code')
      const error = parsed.searchParams.get('error')
      const state = parsed.searchParams.get('state')
      if (stateHolder.value && state !== stateHolder.value) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h1>Authorization failed</h1></body></html>')
        rejectCode?.(new Error('OAuth callback state did not match'))
        return
      }
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h1>Connected</h1><p>You can close this window.</p></body></html>')
        resolveCode?.(code)
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h1>Authorization failed</h1></body></html>')
        rejectCode?.(new Error(error || 'OAuth callback did not include a code'))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('Failed to start OAuth callback server'))
    })
    server.on('error', reject)
  })

  const timeout = setTimeout(
    () => {
      rejectCode?.(new Error('Timed out waiting for OAuth callback'))
    },
    5 * 60 * 1000
  )

  return {
    redirectUrl: `http://127.0.0.1:${port}/oauth/callback`,
    waitForCode: async () => {
      try {
        return await codePromise
      } finally {
        clearTimeout(timeout)
      }
    },
    close: () =>
      new Promise((resolve) => {
        if (!server) {
          resolve()
          return
        }
        server.close(() => resolve())
      })
  }
}

export class McpConnectionManager {
  private registry: McpRegistryManager
  private connections = new Map<string, ActiveConnection | Promise<ActiveConnection>>()

  constructor(registry: McpRegistryManager) {
    this.registry = registry
  }

  async listTools(projectFolder?: string | null): Promise<Tool[]> {
    const servers = this.registry.getEnabledServers(projectFolder)
    const tools: Tool[] = []
    for (const server of servers) {
      try {
        const serverTools = await this.listServerTools(server)
        tools.push(
          ...serverTools.map((tool) => ({
            ...tool,
            name: toolName(server, tool),
            description: tool.description
              ? `[${server.name}] ${tool.description}`
              : `Tool from ${server.name}`,
            _meta: {
              ...(tool._meta ?? {}),
              orchestrate: { serverId: server.id, serverSlug: server.slug, originalName: tool.name }
            }
          }))
        )
      } catch {
        // listServerTools records per-server status; keep other MCPs available.
      }
    }
    return tools
  }

  async callTool(
    projectFolder: string | null | undefined,
    name: string,
    args: unknown
  ): Promise<unknown> {
    const servers = this.registry.getEnabledServers(projectFolder)
    for (const server of servers) {
      const originalName = originalToolName(server, name)
      if (!originalName) continue
      const conn = await this.ensureConnection(server)
      return conn.client.callTool({
        name: originalName,
        arguments: args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
      })
    }
    throw new Error(`Unknown MCP tool: ${name}`)
  }

  async testServer(serverId: string): Promise<McpConnectionStatus> {
    const server = this.registry.getServer(serverId)
    if (!server) throw new Error('Unknown MCP server')
    await this.closeServer(serverId)
    try {
      const tools = await this.listServerTools(server)
      return this.setStatus(
        serverId,
        'connected',
        `Connected with ${tools.length} tools`,
        tools.length
      )
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return this.setStatus(serverId, 'auth-required', 'OAuth authorization required')
      }
      return this.setStatus(serverId, 'error', err instanceof Error ? err.message : String(err))
    } finally {
      await this.closeServer(serverId)
    }
  }

  async startOAuth(serverId: string): Promise<McpConnectionStatus> {
    const server = this.registry.getServer(serverId)
    if (!server) throw new Error('Unknown MCP server')
    if (server.transport === 'stdio') {
      throw new Error('OAuth is only supported for remote MCP servers')
    }
    if (server.authType !== 'oauth') {
      throw new Error('This MCP server is not configured for OAuth')
    }

    await this.closeServer(serverId)
    const stateHolder: OAuthStateHolder = { value: randomBytes(16).toString('hex') }
    const callbackServer = await startOAuthCallbackServer(stateHolder)
    const client = new Client({ name: 'orchestrate-upstream-oauth', version: '1.0.0' })
    const transport = this.createTransport(server, true, callbackServer.redirectUrl, stateHolder)

    try {
      try {
        await client.connect(transport)
      } catch (err) {
        if (!(err instanceof UnauthorizedError)) throw err
        const code = await callbackServer.waitForCode()
        const finishAuth = 'finishAuth' in transport ? transport.finishAuth : undefined
        if (typeof finishAuth !== 'function') throw new Error('OAuth transport cannot finish auth')
        await finishAuth.call(transport, code)
      }
      await client.close()
      await this.closeServer(serverId)
      const tools = await this.listServerTools(server)
      const nextStatus = this.setStatus(
        serverId,
        'connected',
        `Connected with ${tools.length} tools`,
        tools.length
      )
      await this.closeServer(serverId)
      return nextStatus
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return this.setStatus(serverId, 'auth-required', 'OAuth authorization required')
      }
      return this.setStatus(serverId, 'error', err instanceof Error ? err.message : String(err))
    } finally {
      await callbackServer.close()
      await client.close().catch(() => {})
    }
  }

  async closeServer(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId)
    if (!conn) return
    this.connections.delete(serverId)
    const active = await Promise.resolve(conn).catch(() => null)
    if (!active) return
    await active.client.close().catch(() => {})
    await active.transport.close?.().catch(() => {})
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.connections.keys())
    await Promise.all(ids.map((id) => this.closeServer(id)))
  }

  invalidate(serverId: string): void {
    void this.closeServer(serverId)
  }

  private async listServerTools(server: PersistedMcpServerConfig): Promise<Tool[]> {
    const conn = await this.ensureConnection(server)
    const tools: Tool[] = []
    let cursor: string | undefined
    do {
      const result = await conn.client.listTools(cursor ? { cursor } : undefined)
      tools.push(...result.tools)
      cursor = result.nextCursor
    } while (cursor)
    this.setStatus(server.id, 'connected', `Connected with ${tools.length} tools`, tools.length)
    return tools
  }

  private async ensureConnection(server: PersistedMcpServerConfig): Promise<ActiveConnection> {
    const existing = this.connections.get(server.id)
    if (existing) return existing

    const connecting = (async (): Promise<ActiveConnection> => {
      const client = new Client({ name: 'orchestrate-upstream', version: '1.0.0' })
      const transport = this.createTransport(server, false)
      try {
        await client.connect(transport)
        return { client, transport, serverId: server.id }
      } catch (err) {
        await client.close().catch(() => {})
        await transport.close?.().catch(() => {})
        if (err instanceof UnauthorizedError) {
          this.setStatus(server.id, 'auth-required', 'OAuth authorization required')
        } else {
          this.setStatus(server.id, 'error', err instanceof Error ? err.message : String(err))
        }
        throw err
      }
    })()

    this.connections.set(server.id, connecting)
    try {
      const conn = await connecting
      if (this.connections.get(server.id) === connecting) {
        this.connections.set(server.id, conn)
      }
      return conn
    } catch (err) {
      if (this.connections.get(server.id) === connecting) {
        this.connections.delete(server.id)
      }
      throw err
    }
  }

  private createTransport(
    server: PersistedMcpServerConfig,
    interactiveOAuth: boolean,
    redirectUrl = 'http://127.0.0.1/oauth/callback',
    stateHolder?: OAuthStateHolder
  ): Transport {
    if (server.transport === 'stdio') {
      return new StdioClientTransport({
        command: server.command!,
        args: server.args ?? [],
        cwd: server.cwd,
        env: { ...getDefaultEnvironment(), ...this.registry.getPlainEnv(server) },
        stderr: 'pipe'
      })
    }

    const headers = this.registry.getPlainHeaders(server)
    const authProvider =
      server.authType === 'oauth'
        ? new PersistentOAuthProvider({
            registry: this.registry,
            serverId: server.id,
            redirectUrl,
            interactive: interactiveOAuth,
            stateHolder
          })
        : undefined

    if (server.transport === 'streamable-http') {
      return new StreamableHTTPClientTransport(new URL(server.url!), {
        authProvider,
        requestInit: withHeaders(headers)
      })
    }

    return new SSEClientTransport(new URL(server.url!), {
      authProvider,
      requestInit: withHeaders(headers),
      eventSourceInit: {
        fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string> | undefined), ...headers }
          })
      } as unknown as EventSourceInit
    })
  }

  private setStatus(
    serverId: string,
    state: McpConnectionStatus['state'],
    message?: string,
    toolCount?: number
  ): McpConnectionStatus {
    const next = status(serverId, state, message, toolCount)
    this.registry.updateStatus(serverId, next)
    return next
  }
}
