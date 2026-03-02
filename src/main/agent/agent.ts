import { query, type Query, type SDKMessage, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'

export interface AgentChunk {
  type: 'text' | 'tool_use' | 'done' | 'error'
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

const MCP_PREFIX = 'mcp__orchestrate__'

export class Agent {
  private apiKey: string | null = null
  private sessionId: string | null = null
  private abortController: AbortController | null = null
  private activeQuery: Query | null = null

  setApiKey(key: string): void {
    this.apiKey = key
  }

  hasApiKey(): boolean {
    return this.apiKey !== null
  }

  clearHistory(): void {
    this.sessionId = null
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.activeQuery) {
      this.activeQuery.close()
      this.activeQuery = null
    }
  }

  async *sendMessage(
    userMessage: string,
    systemPrompt: string,
    mcpServer: McpSdkServerConfigWithInstance,
    projectFolder: string,
    allowedTools: string[]
  ): AsyncGenerator<AgentChunk> {
    if (!this.apiKey) {
      yield { type: 'error', content: 'No API key set. Please set your Anthropic API key in the Orchestrate tab.' }
      return
    }

    this.abortController = new AbortController()

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: 'claude-sonnet-4-6',
          systemPrompt,
          cwd: projectFolder,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          maxTurns: 50,
          includePartialMessages: true,
          abortController: this.abortController,
          persistSession: true,
          mcpServers: { orchestrate: mcpServer },
          allowedTools,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: this.apiKey
          },
          ...(this.sessionId ? { resume: this.sessionId } : {})
        }
      })

      this.activeQuery = q

      for await (const message of q) {
        yield* this.mapMessage(message)
      }

      yield { type: 'done' }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        yield { type: 'error', content: 'Message cancelled.' }
        return
      }

      const errMsg = err instanceof Error ? err.message : String(err)

      if (errMsg.includes('authentication') || errMsg.includes('401') || /invalid.*api.*key/i.test(errMsg)) {
        yield { type: 'error', content: 'Invalid API key. Please check your Anthropic API key.' }
      } else if (errMsg.includes('rate') && errMsg.includes('limit')) {
        yield { type: 'error', content: 'Rate limit exceeded. Please wait a moment and try again.' }
      } else if (errMsg.includes('ENOENT') && errMsg.includes('claude')) {
        yield { type: 'error', content: 'Claude CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code' }
      } else {
        yield { type: 'error', content: `Error: ${errMsg}` }
      }
    } finally {
      this.abortController = null
      this.activeQuery = null
    }
  }

  private *mapMessage(message: SDKMessage): Generator<AgentChunk> {
    switch (message.type) {
      case 'system':
        if ('subtype' in message && message.subtype === 'init') {
          this.sessionId = message.session_id
        }
        break

      case 'assistant': {
        const content = message.message?.content
        if (!Array.isArray(content)) break
        for (const block of content) {
          if ('text' in block && typeof block.text === 'string' && block.text) {
            yield { type: 'text', content: block.text }
          } else if ('type' in block && block.type === 'tool_use') {
            const toolBlock = block as { name: string; input: Record<string, unknown> }
            const toolName = toolBlock.name.startsWith(MCP_PREFIX)
              ? toolBlock.name.slice(MCP_PREFIX.length)
              : toolBlock.name
            yield { type: 'tool_use', tool: toolName, input: toolBlock.input }
          }
        }
        break
      }

      case 'stream_event': {
        const event = message.event
        if (event.type === 'content_block_delta' && 'delta' in event) {
          const delta = event.delta as { type: string; text?: string }
          if (delta.type === 'text_delta' && delta.text) {
            yield { type: 'text', content: delta.text }
          }
        }
        break
      }

      case 'result': {
        if (message.subtype !== 'success') {
          const errors = 'errors' in message ? (message.errors as string[]) : []
          const errorText = errors.length > 0 ? errors.join('; ') : `Agent stopped: ${message.subtype}`
          yield { type: 'error', content: errorText }
        }
        // session_id is already captured from init
        break
      }

      // Ignore other message types (status, hooks, auth, etc.)
      default:
        break
    }
  }
}
