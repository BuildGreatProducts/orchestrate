import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, Tool, ContentBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages'

export interface AgentChunk {
  type: 'text' | 'tool_use' | 'done' | 'error'
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

export class Agent {
  private client: Anthropic | null = null
  private conversationHistory: MessageParam[] = []
  private abortController: AbortController | null = null

  setApiKey(key: string): void {
    this.client = new Anthropic({ apiKey: key })
  }

  hasApiKey(): boolean {
    return this.client !== null
  }

  clearHistory(): void {
    this.conversationHistory = []
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  async *sendMessage(
    userMessage: string,
    tools: Tool[],
    systemPrompt: string,
    executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>
  ): AsyncGenerator<AgentChunk> {
    if (!this.client) {
      yield { type: 'error', content: 'No API key set. Please set your Anthropic API key in the Manage tab.' }
      return
    }

    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    })

    this.abortController = new AbortController()

    try {
      // Agent loop: keep going while there are tool calls
      while (true) {
        const stream = this.client.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages: this.conversationHistory
        }, { signal: this.abortController.signal })

        // Stream text deltas as they arrive
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { type: 'text', content: event.delta.text }
            }
          }
        }

        const finalMessage = await stream.finalMessage()

        // Add assistant message to history
        this.conversationHistory.push({
          role: 'assistant',
          content: finalMessage.content
        })

        // Check if there are tool uses
        const toolUseBlocks = finalMessage.content.filter(
          (block) => block.type === 'tool_use'
        )

        if (toolUseBlocks.length === 0) {
          yield { type: 'done' }
          break
        }

        // Execute tools and collect results
        const toolResults: ContentBlockParam[] = []

        for (const block of toolUseBlocks) {
          if (block.type !== 'tool_use') continue

          yield {
            type: 'tool_use',
            tool: block.name,
            input: block.input as Record<string, unknown>
          }

          const result = await executeTool(block.name, block.input as Record<string, unknown>)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          } as ToolResultBlockParam)
        }

        // Push tool results and loop back
        this.conversationHistory.push({
          role: 'user',
          content: toolResults
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        yield { type: 'error', content: 'Message cancelled.' }
        return
      }

      if (err instanceof Anthropic.AuthenticationError) {
        yield { type: 'error', content: 'Invalid API key. Please check your Anthropic API key.' }
      } else if (err instanceof Anthropic.RateLimitError) {
        yield { type: 'error', content: 'Rate limit exceeded. Please wait a moment and try again.' }
      } else if (err instanceof Anthropic.APIConnectionError) {
        yield { type: 'error', content: 'Could not connect to the Anthropic API. Check your internet connection.' }
      } else {
        const message = err instanceof Error ? err.message : String(err)
        yield { type: 'error', content: `Error: ${message}` }
      }
    } finally {
      this.abortController = null
    }
  }
}
