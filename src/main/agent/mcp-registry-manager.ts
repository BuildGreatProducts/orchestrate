import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import Store from 'electron-store'
import type {
  McpAuthState,
  McpAuthType,
  McpConnectionStatus,
  McpProjectSelection,
  McpRegistrySnapshot,
  McpSecretField,
  McpServerConfig,
  McpServerInput,
  McpTransportType
} from '@shared/types'

interface PersistedMcpServer {
  id: string
  name: string
  slug: string
  transport: McpTransportType
  enabled: boolean
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  authType: McpAuthType
  envKeys: string[]
  headerKeys: string[]
  encryptedEnv: Record<string, string>
  encryptedHeaders: Record<string, string>
  encryptedOAuthTokens?: string
  encryptedOAuthClientInformation?: string
  encryptedOAuthCodeVerifier?: string
  lastStatus?: McpConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface McpRegistryStoreData {
  servers: PersistedMcpServer[]
  projectServers: Record<string, string[]>
}

export interface OAuthSecretState {
  tokens?: unknown
  clientInformation?: unknown
  codeVerifier?: string
}

function defaultStoreData(): McpRegistryStoreData {
  return { servers: [], projectServers: {} }
}

const VALID_TRANSPORTS = new Set<McpTransportType>(['stdio', 'streamable-http', 'sse'])
const VALID_AUTH_TYPES = new Set<McpAuthType>(['none', 'secret', 'oauth'])
const MAX_NAME_LENGTH = 100
const MAX_SECRET_KEY_LENGTH = 128
const MAX_SECRET_VALUE_LENGTH = 16_384
const MAX_ARG_COUNT = 64
const MAX_ARG_LENGTH = 4096
const MAX_COMMAND_LENGTH = 4096
const MAX_URL_LENGTH = 4096
const MAX_CWD_LENGTH = 4096
const HTTP_HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function normalizeKey(key: string): string {
  return key.trim()
}

function normalizeProjectKey(folder: string): string {
  return folder.trim()
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'mcp'
}

function uniqueSlug(name: string, servers: PersistedMcpServer[], currentId?: string): string {
  const base = slugify(name)
  let candidate = base
  let index = 2
  const taken = new Set(servers.filter((s) => s.id !== currentId).map((s) => s.slug))
  while (taken.has(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function encryptJson(value: unknown): string {
  const raw = JSON.stringify(value)
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(raw).toString('base64')}`
  }
  throw new Error('Secure credential storage is not available')
}

function decryptJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined
  const [prefix, payload] = value.split(':', 2)
  if (!payload) return undefined
  try {
    if (prefix !== 'safe') return undefined
    const raw = safeStorage.decryptString(Buffer.from(payload, 'base64'))
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function secretFields(keys: string[], encrypted: Record<string, string>): McpSecretField[] {
  return keys
    .filter((key) => key.trim())
    .map((key) => ({ name: key, hasValue: Boolean(encrypted[key]) }))
}

function mergeSecrets(
  existingKeys: string[],
  existingEncrypted: Record<string, string>,
  next: Record<string, string> | undefined,
  kind: 'env' | 'header'
): { keys: string[]; encrypted: Record<string, string> } {
  if (next === undefined) {
    return { keys: existingKeys, encrypted: existingEncrypted }
  }
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    throw new Error(`${kind} secrets must be an object`)
  }

  const keys: string[] = []
  const encrypted: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(next)) {
    const key = normalizeKey(rawKey)
    if (!key) continue
    validateSecretKey(key, kind)
    keys.push(key)
    const value = rawValue ?? ''
    validateSecretValue(value, kind)
    if (value) {
      encrypted[key] = encryptJson(value)
    } else if (existingEncrypted[key]) {
      encrypted[key] = existingEncrypted[key]
    }
  }
  return { keys: Array.from(new Set(keys)), encrypted }
}

function sanitizeArgs(args: string[] | undefined): string[] {
  if (!Array.isArray(args)) return []
  if (args.length > MAX_ARG_COUNT) throw new Error(`MCP args cannot exceed ${MAX_ARG_COUNT} items`)
  return args
    .map((arg) => String(arg))
    .filter((arg) => arg.length > 0)
    .map((arg) => {
      if (arg.length > MAX_ARG_LENGTH) throw new Error('MCP argument is too long')
      if (arg.includes('\0')) throw new Error('MCP argument cannot contain null bytes')
      return arg
    })
}

function validateSecretKey(key: string, kind: 'env' | 'header'): void {
  if (key.length > MAX_SECRET_KEY_LENGTH) throw new Error(`${kind} key is too long`)
  if (key.includes('\0') || key.includes('\n') || key.includes('\r')) {
    throw new Error(`${kind} key contains invalid characters`)
  }
  if (kind === 'env' && !ENV_NAME_RE.test(key)) {
    throw new Error(`Invalid environment variable name: ${key}`)
  }
  if (kind === 'header' && !HTTP_HEADER_NAME_RE.test(key)) {
    throw new Error(`Invalid HTTP header name: ${key}`)
  }
}

function validateSecretValue(value: string, kind: 'env' | 'header'): void {
  if (value.length > MAX_SECRET_VALUE_LENGTH) throw new Error(`${kind} value is too long`)
  if (value.includes('\0')) throw new Error(`${kind} value cannot contain null bytes`)
  if (kind === 'header' && (value.includes('\n') || value.includes('\r'))) {
    throw new Error('HTTP header values cannot contain newlines')
  }
}

function validateTransport(value: unknown): McpTransportType {
  if (VALID_TRANSPORTS.has(value as McpTransportType)) return value as McpTransportType
  throw new Error('Invalid MCP transport')
}

function validateAuthType(value: unknown): McpAuthType {
  const authType = value ?? 'none'
  if (VALID_AUTH_TYPES.has(authType as McpAuthType)) return authType as McpAuthType
  throw new Error('Invalid MCP auth type')
}

export class McpRegistryManager {
  private store: Store<McpRegistryStoreData>
  private resolveProjectFolder: (projectFolder: string) => string | null

  constructor(
    store: Store<McpRegistryStoreData>,
    resolveProjectFolder: (projectFolder: string) => string | null
  ) {
    this.store = store
    this.resolveProjectFolder = resolveProjectFolder
    const data = this.load()
    this.save(data)
  }

  listRegistry(projectFolder?: string | null): McpRegistrySnapshot {
    const data = this.load()
    const servers = data.servers.map((server) => this.toPublicConfig(server))
    const resolvedProject = projectFolder ? this.requireProject(projectFolder) : null
    const project = resolvedProject
      ? {
          projectFolder: resolvedProject,
          enabledServerIds: data.projectServers[resolvedProject] ?? []
        }
      : null
    return { servers, project }
  }

  addServer(input: McpServerInput, enableForProject?: string | null): McpServerConfig {
    const data = this.load()
    const now = new Date().toISOString()
    const transport = validateTransport(input.transport)
    const authType = validateAuthType(input.authType)
    const name = this.requireName(input.name)
    const env = mergeSecrets([], {}, input.env, 'env')
    const headers = mergeSecrets([], {}, input.headers, 'header')
    const server: PersistedMcpServer = {
      id: randomUUID(),
      name,
      slug: uniqueSlug(name, data.servers),
      transport,
      enabled: input.enabled !== false,
      command: this.optionalTrim(input.command, MAX_COMMAND_LENGTH),
      args: sanitizeArgs(input.args),
      cwd: this.optionalTrim(input.cwd, MAX_CWD_LENGTH),
      url: this.optionalTrim(input.url, MAX_URL_LENGTH),
      authType,
      envKeys: env.keys,
      headerKeys: headers.keys,
      encryptedEnv: env.encrypted,
      encryptedHeaders: headers.encrypted,
      createdAt: now,
      updatedAt: now
    }
    this.validateServerShape(server)
    data.servers.push(server)
    if (enableForProject) {
      const project = this.requireProject(enableForProject)
      data.projectServers[project] = Array.from(
        new Set([...(data.projectServers[project] ?? []), server.id])
      )
    }
    this.save(data)
    return this.toPublicConfig(server)
  }

  updateServer(id: string, input: McpServerInput): McpServerConfig {
    const data = this.load()
    const index = data.servers.findIndex((server) => server.id === id)
    if (index === -1) throw new Error('Unknown MCP server')

    const existing = data.servers[index]
    const transport = validateTransport(input.transport)
    const authType = validateAuthType(input.authType)
    const name = this.requireName(input.name)
    const env = mergeSecrets(existing.envKeys, existing.encryptedEnv, input.env, 'env')
    const headers = mergeSecrets(
      existing.headerKeys,
      existing.encryptedHeaders,
      input.headers,
      'header'
    )
    const next: PersistedMcpServer = {
      ...existing,
      name,
      slug: uniqueSlug(name, data.servers, id),
      transport,
      enabled: input.enabled !== false,
      command: this.optionalTrim(input.command, MAX_COMMAND_LENGTH),
      args: sanitizeArgs(input.args),
      cwd: this.optionalTrim(input.cwd, MAX_CWD_LENGTH),
      url: this.optionalTrim(input.url, MAX_URL_LENGTH),
      authType,
      envKeys: env.keys,
      headerKeys: headers.keys,
      encryptedEnv: env.encrypted,
      encryptedHeaders: headers.encrypted,
      updatedAt: new Date().toISOString()
    }
    this.validateServerShape(next)
    data.servers[index] = next
    this.save(data)
    return this.toPublicConfig(next)
  }

  removeServer(id: string): void {
    const data = this.load()
    data.servers = data.servers.filter((server) => server.id !== id)
    for (const [project, ids] of Object.entries(data.projectServers)) {
      data.projectServers[project] = ids.filter((serverId) => serverId !== id)
    }
    this.save(data)
  }

  setProjectEnabled(
    projectFolder: string,
    serverId: string,
    enabled: boolean
  ): McpProjectSelection {
    const data = this.load()
    const project = this.requireProject(projectFolder)
    if (!data.servers.some((server) => server.id === serverId)) {
      throw new Error('Unknown MCP server')
    }
    const current = new Set(data.projectServers[project] ?? [])
    if (enabled) current.add(serverId)
    else current.delete(serverId)
    data.projectServers[project] = Array.from(current)
    this.save(data)
    return { projectFolder: project, enabledServerIds: data.projectServers[project] }
  }

  getServer(id: string): PersistedMcpServer | null {
    return this.load().servers.find((server) => server.id === id) ?? null
  }

  getEnabledServers(projectFolder?: string | null): PersistedMcpServer[] {
    if (!projectFolder) return []
    const data = this.load()
    const project = this.requireProject(projectFolder)
    const enabled = new Set(data.projectServers[project] ?? [])
    return data.servers.filter((server) => server.enabled && enabled.has(server.id))
  }

  getPlainEnv(server: PersistedMcpServer): Record<string, string> {
    return this.decryptSecretRecord(server.envKeys, server.encryptedEnv)
  }

  getPlainHeaders(server: PersistedMcpServer): Record<string, string> {
    return this.decryptSecretRecord(server.headerKeys, server.encryptedHeaders)
  }

  getOAuthState(serverId: string): OAuthSecretState {
    const server = this.getServer(serverId)
    if (!server) throw new Error('Unknown MCP server')
    return {
      tokens: decryptJson(server.encryptedOAuthTokens),
      clientInformation: decryptJson(server.encryptedOAuthClientInformation),
      codeVerifier: decryptJson<string>(server.encryptedOAuthCodeVerifier)
    }
  }

  updateOAuthState(serverId: string, updates: OAuthSecretState): void {
    const data = this.load()
    const server = data.servers.find((entry) => entry.id === serverId)
    if (!server) throw new Error('Unknown MCP server')
    if ('tokens' in updates) {
      server.encryptedOAuthTokens =
        updates.tokens === undefined ? undefined : encryptJson(updates.tokens)
    }
    if ('clientInformation' in updates) {
      server.encryptedOAuthClientInformation =
        updates.clientInformation === undefined ? undefined : encryptJson(updates.clientInformation)
    }
    if ('codeVerifier' in updates) {
      server.encryptedOAuthCodeVerifier =
        updates.codeVerifier === undefined ? undefined : encryptJson(updates.codeVerifier)
    }
    server.updatedAt = new Date().toISOString()
    this.save(data)
  }

  updateStatus(serverId: string, status: McpConnectionStatus): void {
    const data = this.load()
    const server = data.servers.find((entry) => entry.id === serverId)
    if (!server) return
    server.lastStatus = status
    this.save(data)
  }

  toPublicConfig(server: PersistedMcpServer): McpServerConfig {
    const auth: McpAuthState = {
      type: server.authType,
      connected: Boolean(decryptJson(server.encryptedOAuthTokens)),
      needsAuth: server.lastStatus?.state === 'auth-required',
      error: server.lastStatus?.state === 'error' ? server.lastStatus.message : undefined
    }
    return {
      id: server.id,
      name: server.name,
      slug: server.slug,
      transport: server.transport,
      enabled: server.enabled,
      command: server.command,
      args: server.args ?? [],
      cwd: server.cwd,
      url: server.url,
      authType: server.authType,
      env: secretFields(server.envKeys, server.encryptedEnv),
      headers: secretFields(server.headerKeys, server.encryptedHeaders),
      auth,
      status: server.lastStatus,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt
    }
  }

  private decryptSecretRecord(
    keys: string[],
    encryptedValues: Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {}
    for (const key of keys) {
      const value = decryptJson<string>(encryptedValues[key])
      if (value !== undefined) result[key] = value
    }
    return result
  }

  private validateServerShape(server: PersistedMcpServer): void {
    if (server.transport === 'stdio' && !server.command) {
      throw new Error('Command is required for stdio MCP servers')
    }
    if (server.transport === 'stdio' && server.authType === 'oauth') {
      throw new Error('OAuth is only supported for remote MCP servers')
    }
    if ((server.transport === 'streamable-http' || server.transport === 'sse') && !server.url) {
      throw new Error('URL is required for remote MCP servers')
    }
    if (server.url) {
      const parsed = new URL(server.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('MCP URL must use http or https')
      }
    }
  }

  private requireName(name: string): string {
    const trimmed = String(name ?? '').trim()
    if (!trimmed) throw new Error('MCP name is required')
    if (trimmed.length > MAX_NAME_LENGTH) throw new Error('MCP name is too long')
    if (trimmed.includes('\0')) throw new Error('MCP name cannot contain null bytes')
    return trimmed
  }

  private optionalTrim(value: string | undefined, maxLength: number): string | undefined {
    const trimmed = typeof value === 'string' ? value.trim() : undefined
    if (trimmed && trimmed.length > maxLength) throw new Error('MCP field is too long')
    if (trimmed?.includes('\0')) throw new Error('MCP field cannot contain null bytes')
    return trimmed ? trimmed : undefined
  }

  private requireProject(projectFolder: string): string {
    const resolved = this.resolveProjectFolder(projectFolder)
    if (!resolved) throw new Error('Unknown project folder')
    return normalizeProjectKey(resolved)
  }

  private load(): McpRegistryStoreData {
    return {
      ...defaultStoreData(),
      ...(this.store.store as McpRegistryStoreData)
    }
  }

  private save(data: McpRegistryStoreData): void {
    this.store.store = data
  }
}

export type PersistedMcpServerConfig = PersistedMcpServer
