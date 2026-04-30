/**
 * Writes a temporary MCP config JSON file for CLI agents (Claude Code, Codex).
 */
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'
import { getMcpSecret } from './mcp-http-server'

let configPath: string | null = null
let activePort: number | null = null
const scopedConfigPaths = new Map<string, string>()

/**
 * Returns the absolute path to the stdio-to-HTTP MCP proxy script.
 * This proxy is used by Codex (which only supports stdio MCP servers).
 */
export function getStdioProxyPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp-stdio-proxy.js')
  }
  return join(app.getAppPath(), 'resources', 'mcp-stdio-proxy.js')
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function scopeKey(projectFolder?: string | null, taskId?: string | null): string {
  return `${projectFolder ?? ''}\0${taskId ?? ''}`
}

function scopedHeaders(
  projectFolder?: string | null,
  taskId?: string | null
): Record<string, string> {
  const headers: Record<string, string> = { 'X-MCP-Secret': getMcpSecret() }
  if (projectFolder) headers['X-Orchestrate-Project'] = projectFolder
  if (taskId) headers['X-Orchestrate-Task'] = taskId
  return headers
}

function scopedConfigPath(projectFolder: string, taskId?: string | null): string {
  const key = scopeKey(projectFolder, taskId)
  const existing = scopedConfigPaths.get(key)
  if (existing) return existing

  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
  const nextPath = join(app.getPath('temp'), `orchestrate-mcp-config-${hash}.json`)
  scopedConfigPaths.set(key, nextPath)
  return nextPath
}

/**
 * Returns the Codex `-c` flags for inline MCP server configuration,
 * or null if the MCP server is not running.
 */
export function getCodexMcpFlags(): string | null {
  return getCodexMcpFlagsForProject(null, null)
}

export function getCodexMcpFlagsForProject(
  projectFolder?: string | null,
  taskId?: string | null
): string | null {
  if (activePort === null) return null
  const proxyPath = getStdioProxyPath()
  const url = `http://127.0.0.1:${activePort}/mcp`
  const secret = getMcpSecret()
  const args = [proxyPath, url, secret]
  if (projectFolder) args.push(projectFolder)
  if (taskId) args.push(taskId)
  return [
    '-c',
    shellQuote('mcp_servers.orchestrate.command="node"'),
    '-c',
    shellQuote(`mcp_servers.orchestrate.args=${JSON.stringify(args)}`)
  ].join(' ')
}

export function writeMcpConfigFile(port: number): string {
  activePort = port
  configPath = join(app.getPath('temp'), 'orchestrate-mcp-config.json')
  writeConfigToDisk()
  return configPath
}

function writeConfigToDisk(): void {
  if (!configPath || activePort === null) return
  writeConfigFile(configPath)
}

function writeConfigFile(
  targetPath: string,
  projectFolder?: string | null,
  taskId?: string | null
): void {
  if (activePort === null) return
  const config = {
    mcpServers: {
      orchestrate: {
        type: 'http',
        url: `http://127.0.0.1:${activePort}/mcp`,
        headers: scopedHeaders(projectFolder, taskId)
      }
    }
  }
  writeFileSync(targetPath, JSON.stringify(config, null, 2), { mode: 0o600 })
  console.log(`[MCP] Config file written to ${targetPath}`)
}

export function getMcpConfigPath(): string | null {
  if (!configPath || activePort === null) return null
  // Re-create if the file was deleted (OS temp cleanup, manual removal, etc.)
  if (!existsSync(configPath)) {
    writeConfigToDisk()
  }
  return configPath
}

export function getMcpConfigPathForProject(
  projectFolder?: string | null,
  taskId?: string | null
): string | null {
  if (activePort === null) return null
  if (!projectFolder) return getMcpConfigPath()
  const path = scopedConfigPath(projectFolder, taskId)
  if (!existsSync(path)) {
    writeConfigFile(path, projectFolder, taskId)
  }
  return path
}

export function cleanupMcpConfigFile(): void {
  if (configPath) {
    try {
      unlinkSync(configPath)
      console.log('[MCP] Config file cleaned up')
    } catch {
      // File may already be gone
    }
    configPath = null
  }
  for (const scopedPath of scopedConfigPaths.values()) {
    try {
      unlinkSync(scopedPath)
    } catch {
      // File may already be gone
    }
  }
  scopedConfigPaths.clear()
  activePort = null
}
