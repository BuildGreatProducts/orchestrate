import { readFile, writeFile, mkdir, unlink, rename, readdir } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { nanoid } from 'nanoid'
import type { ChatConversation, ChatConversationSummary } from '@shared/types'

// Fix #10: export for reuse in IPC handler
export const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function validateConversationId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid conversation ID: ${String(id)}`)
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

export class ChatHistoryManager {
  private chatsDir: string

  constructor(projectFolder: string) {
    this.chatsDir = join(projectFolder, '.orchestrate', 'chats')
  }

  setProjectFolder(folder: string): void {
    this.chatsDir = join(folder, '.orchestrate', 'chats')
  }

  private validateId(id: string): void {
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`Invalid conversation ID: ${id}`)
    }
    const target = resolve(this.chatsDir, `${id}.json`)
    const rel = relative(this.chatsDir, target)
    if (rel.startsWith('..') || rel.startsWith(sep)) {
      throw new Error('Conversation ID resolves outside chats directory')
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.chatsDir, { recursive: true })
  }

  // Fix #8: no ensureDir on read path — ENOENT returns []
  async listConversations(): Promise<ChatConversationSummary[]> {
    let files: string[]
    try {
      files = await readdir(this.chatsDir)
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return []
      throw err
    }

    const summaries: ChatConversationSummary[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.chatsDir, file), 'utf-8')
        const conv: ChatConversation = JSON.parse(raw)
        if (!conv.id || !conv.messages) continue

        const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === 'user')
        const preview = lastUserMsg
          ? lastUserMsg.content.slice(0, 80) + (lastUserMsg.content.length > 80 ? '...' : '')
          : ''

        summaries.push({
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv.messages.length,
          preview
        })
      } catch {
        // Skip malformed files
      }
    }

    summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return summaries
  }

  async loadConversation(id: string): Promise<ChatConversation | null> {
    this.validateId(id)
    try {
      const raw = await readFile(join(this.chatsDir, `${id}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return null
      throw err
    }
  }

  async saveConversation(conversation: ChatConversation): Promise<void> {
    this.validateId(conversation.id)
    await this.ensureDir()
    const tmpPath = join(this.chatsDir, `${conversation.id}.json.tmp`)
    const finalPath = join(this.chatsDir, `${conversation.id}.json`)
    try {
      await writeFile(tmpPath, JSON.stringify(conversation, null, 2), 'utf-8')
      await rename(tmpPath, finalPath)
    } catch (err) {
      await unlink(tmpPath).catch(() => {})
      throw err
    }
  }

  async deleteConversation(id: string): Promise<void> {
    this.validateId(id)
    try {
      await unlink(join(this.chatsDir, `${id}.json`))
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
  }

  async renameConversation(id: string, title: string): Promise<void> {
    this.validateId(id)
    const conv = await this.loadConversation(id)
    if (!conv) throw new Error(`Conversation ${id} not found`)
    conv.title = title
    conv.updatedAt = new Date().toISOString()
    await this.saveConversation(conv)
  }

  generateId(): string {
    return nanoid(8)
  }
}
