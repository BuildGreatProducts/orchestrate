import type { AgentConfig } from '@shared/types'

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

interface BuildCommandOptions {
  agent: AgentConfig
  prompt: string
  systemPrompt?: string
  taskFile?: string
  mcpConfigPath: string | null
  codexMcpFlags: string | null
}

/**
 * Build the shell command to invoke an agent.
 * If prompt is empty, launches the agent in interactive mode (just the CLI + MCP flags).
 */
export function buildAgentCommand(opts: BuildCommandOptions): string {
  const { agent, prompt, systemPrompt, taskFile, mcpConfigPath, codexMcpFlags } = opts

  // Resolve MCP flags based on agent's mcpMode
  let mcpFlags = ''
  if (agent.mcpMode === 'config-file' && mcpConfigPath) {
    mcpFlags = `--mcp-config ${shellQuote(mcpConfigPath)}`
  } else if (agent.mcpMode === 'codex-flags' && codexMcpFlags) {
    mcpFlags = codexMcpFlags
  }

  // Interactive mode: no prompt and no task file, just launch the CLI with MCP flags
  if (!prompt && !taskFile) {
    return mcpFlags ? `${agent.cliCommand} ${mcpFlags}` : agent.cliCommand
  }

  const quotedPrompt = prompt
    ? "'" + prompt.replace(/'/g, "'\\''") + "'"
    : ''
  const taskFileRef = taskFile ? `"$(cat ${shellQuote(taskFile)})"` : ''
  // The effective prompt is either the inline prompt or the task file contents
  const effectivePrompt = quotedPrompt || taskFileRef

  // Use commandTemplate if available, otherwise fall back to simple invocation
  let template = agent.commandTemplate || `${agent.cliCommand} {prompt}`

  // Substitute placeholders
  template = template.replace(/\{mcp_flags\}/g, mcpFlags)
  template = template.replace(/\{prompt\}/g, effectivePrompt)
  template = template.replace(
    /\{system_prompt\}/g,
    systemPrompt ? shellQuote(systemPrompt) : "''"
  )
  template = template.replace(/\{task_file\}/g, taskFileRef || effectivePrompt)

  // Clean up double spaces from empty substitutions
  return template.replace(/ {2,}/g, ' ').trim()
}
