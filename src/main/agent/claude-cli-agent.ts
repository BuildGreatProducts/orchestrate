/**
 * Agent that spawns the Claude Code CLI as a subprocess and streams
 * NDJSON output, mapping it to the same AgentChunk interface used
 * by the SDK-based Agent class.
 */
import { spawn, type ChildProcess } from 'child_process'
import type { Readable } from 'stream'
import type { AgentChunk } from './agent'

const MCP_PREFIX = 'mcp__orchestrate__'

export class ClaudeCliAgent {
  private sessionId: string | null = null
  private activeProcess: ChildProcess | null = null
  private killTimer: ReturnType<typeof setTimeout> | null = null

  clearHistory(): void {
    this.sessionId = null
  }

  cancel(): void {
    if (!this.activeProcess) return

    this.activeProcess.kill('SIGTERM')

    // Escalate to SIGKILL if the process doesn't exit within 3s
    this.killTimer = setTimeout(() => {
      if (this.activeProcess && !this.activeProcess.killed) {
        this.activeProcess.kill('SIGKILL')
      }
    }, 3000)
  }

  async *sendMessage(
    userMessage: string,
    systemPrompt: string,
    mcpConfigPath: string,
    projectFolder: string
  ): AsyncGenerator<AgentChunk> {
    const args = [
      '-p',
      '--verbose',
      '--output-format',
      'stream-json',
      '--mcp-config',
      mcpConfigPath,
      '--append-system-prompt',
      systemPrompt,
      '--max-turns',
      '50'
    ]

    if (this.sessionId) {
      args.push('--resume', this.sessionId)
    }

    args.push(userMessage)

    let proc: ChildProcess
    try {
      proc = spawn('claude', args, {
        cwd: projectFolder,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ENOENT')) {
        yield {
          type: 'error',
          content:
            'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
        }
      } else {
        yield { type: 'error', content: `Failed to start Claude CLI: ${msg}` }
      }
      return
    }

    this.activeProcess = proc

    // Collect stderr for error reporting
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    try {
      for await (const line of this.readLines(proc.stdout!)) {
        const chunks = this.parseLine(line)
        for (const chunk of chunks) {
          yield chunk
        }
      }

      // Wait for process to fully exit
      const exitCode = await new Promise<number | null>((resolve) => {
        if (proc.exitCode !== null) {
          resolve(proc.exitCode)
          return
        }
        proc.on('close', (code) => resolve(code))
      })

      if (exitCode !== null && exitCode !== 0) {
        const errText = stderr.trim()
        yield {
          type: 'error',
          content: errText || `Claude CLI exited with code ${exitCode}`
        }
      }

      yield { type: 'done' }
    } catch (err) {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        yield {
          type: 'error',
          content:
            'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        yield { type: 'error', content: `Claude CLI error: ${msg}` }
      }
    } finally {
      this.activeProcess = null
      if (this.killTimer) {
        clearTimeout(this.killTimer)
        this.killTimer = null
      }
    }
  }

  /**
   * Read stdout line-by-line, handling partial chunks.
   */
  private async *readLines(stream: Readable): AsyncGenerator<string> {
    let buffer = ''
    for await (const chunk of stream) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()! // last element may be incomplete
      for (const line of lines) {
        if (line.trim()) yield line
      }
    }
    if (buffer.trim()) yield buffer
  }

  /**
   * Parse a single NDJSON line into AgentChunk(s).
   * Returns an array since an assistant message can contain multiple tool_use blocks.
   */
  private parseLine(line: string): AgentChunk[] {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      // Skip malformed lines
      return []
    }

    const type = msg.type as string
    const chunks: AgentChunk[] = []

    switch (type) {
      case 'system': {
        if (msg.subtype === 'init' && typeof msg.session_id === 'string') {
          this.sessionId = msg.session_id
        }
        break
      }

      case 'assistant': {
        const message = msg.message as Record<string, unknown> | undefined
        const content = message?.content
        if (!Array.isArray(content)) break
        for (const block of content) {
          if (!block || typeof block !== 'object' || !('type' in block)) continue
          if (block.type === 'text') {
            const textBlock = block as { text: string }
            if (textBlock.text) {
              chunks.push({ type: 'text', content: textBlock.text })
            }
          } else if (block.type === 'tool_use') {
            const toolBlock = block as { name: string; input: Record<string, unknown> }
            const toolName = toolBlock.name.startsWith(MCP_PREFIX)
              ? toolBlock.name.slice(MCP_PREFIX.length)
              : toolBlock.name
            chunks.push({ type: 'tool_use', tool: toolName, input: toolBlock.input })
          }
        }
        break
      }

      case 'stream_event': {
        const event = msg.event as Record<string, unknown> | undefined
        if (event?.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string } | undefined
          if (delta?.type === 'text_delta' && delta.text) {
            chunks.push({ type: 'text', content: delta.text })
          }
        }
        break
      }

      case 'result': {
        if (msg.subtype !== 'success') {
          const errors = Array.isArray(msg.errors) ? (msg.errors as string[]) : []
          const errorText =
            errors.length > 0 ? errors.join('; ') : `Agent stopped: ${msg.subtype}`
          chunks.push({ type: 'error', content: errorText })
        }
        // Capture session_id from result too (in case init was missed)
        if (typeof msg.session_id === 'string' && !this.sessionId) {
          this.sessionId = msg.session_id
        }
        break
      }

      // Ignore other message types (status, hooks, auth, tool_progress, etc.)
      default:
        break
    }

    return chunks
  }
}
