/**
 * Writes a temporary MCP config JSON file for CLI agents (Claude Code, Codex).
 */
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let configPath: string | null = null
let activePort: number | null = null

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

/**
 * Returns the Codex `-c` flags for inline MCP server configuration,
 * or null if the MCP server is not running.
 */
export function getCodexMcpFlags(): string | null {
  if (activePort === null) return null
  const proxyPath = getStdioProxyPath()
  const url = `http://127.0.0.1:${activePort}/mcp`
  return `-c 'mcp_servers.orchestrate.command="node"' -c 'mcp_servers.orchestrate.args=["${proxyPath}","${url}"]'`
}

export function writeMcpConfigFile(port: number): string {
  activePort = port
  configPath = join(app.getPath('temp'), 'orchestrate-mcp-config.json')
  writeConfigToDisk()
  return configPath
}

function writeConfigToDisk(): void {
  if (!configPath || activePort === null) return
  const config = {
    mcpServers: {
      orchestrate: {
        type: 'http',
        url: `http://127.0.0.1:${activePort}/mcp`
      }
    }
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`[MCP] Config file written to ${configPath}`)
}

export function getMcpConfigPath(): string | null {
  if (!configPath || activePort === null) return null
  // Re-create if the file was deleted (OS temp cleanup, manual removal, etc.)
  if (!existsSync(configPath)) {
    writeConfigToDisk()
  }
  return configPath
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
}
