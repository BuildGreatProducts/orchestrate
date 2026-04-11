import type { AgentConfig } from './types'

export const BUILT_IN_AGENTS: AgentConfig[] = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    cliCommand: 'claude',
    enabled: true,
    builtin: true,
    mcpMode: 'config-file',
    commandTemplate: 'claude {mcp_flags} --append-system-prompt {system_prompt} {prompt}'
  },
  {
    id: 'codex',
    displayName: 'Codex',
    cliCommand: 'codex',
    enabled: true,
    builtin: true,
    mcpMode: 'codex-flags',
    commandTemplate: 'codex {mcp_flags} {prompt}'
  },
  {
    id: 'droid',
    displayName: 'Droid',
    cliCommand: 'droid',
    enabled: false,
    builtin: true,
    mcpMode: 'none',
    commandTemplate: 'droid {prompt}'
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    cliCommand: 'opencode',
    enabled: false,
    builtin: true,
    mcpMode: 'none',
    commandTemplate: 'opencode {prompt}'
  },
  {
    id: 'forge',
    displayName: 'Forge',
    cliCommand: 'forge',
    enabled: false,
    builtin: true,
    mcpMode: 'none',
    commandTemplate: 'forge {prompt}'
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    cliCommand: 'gemini',
    enabled: false,
    builtin: true,
    mcpMode: 'none',
    commandTemplate: 'gemini {prompt}'
  }
]
