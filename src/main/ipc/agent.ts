import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { markChannelRegistered } from './stubs'
import { Agent } from '../agent/agent'
import { createOrchestrateServer, ORCHESTRATE_TOOL_NAMES } from '../agent/tools'
import { SYSTEM_PROMPT } from '../agent/system-prompt'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'

const BUILTIN_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']

let agentInstance: Agent | null = null

export function clearAgentConversation(): void {
  agentInstance?.cancel()
  agentInstance?.clearHistory()
}

export function registerAgentHandlers(
  getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null,
  getTaskManager: () => TaskManager | null,
  getGitManager: () => GitManager | null,
  _getPtyManager: () => PtyManager | null
): void {
  markChannelRegistered('agent:message')
  markChannelRegistered('agent:setApiKey')
  markChannelRegistered('agent:hasApiKey')
  markChannelRegistered('agent:clearConversation')
  markChannelRegistered('agent:cancel')

  // Initialize store and agent inside the function (after app is ready)
  // to avoid module-level side effects that can fail during bundling/HMR
  const store = new Store()
  const agent = new Agent()
  agentInstance = agent

  // Restore API key from persistent store
  const savedKey = store.get('anthropicApiKey') as string | undefined
  if (savedKey) {
    agent.setApiKey(savedKey)
    process.env.ANTHROPIC_API_KEY = savedKey
  }

  // Build the allowed tools list: built-in + MCP-prefixed orchestrate tools
  const allowedTools = [
    ...BUILTIN_TOOLS,
    ...ORCHESTRATE_TOOL_NAMES.map((name) => `mcp__orchestrate__${name}`)
  ]

  let isProcessing = false

  // Remove any existing handlers to prevent duplicate accumulation
  ipcMain.removeHandler('agent:setApiKey')
  ipcMain.removeHandler('agent:hasApiKey')
  ipcMain.removeHandler('agent:clearConversation')
  ipcMain.removeHandler('agent:cancel')
  ipcMain.removeHandler('agent:message')

  ipcMain.handle('agent:setApiKey', async (_, key: string) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('API key is required')
    }
    const trimmed = key.trim()
    store.set('anthropicApiKey', trimmed)
    agent.setApiKey(trimmed)
    process.env.ANTHROPIC_API_KEY = trimmed
  })

  ipcMain.handle('agent:hasApiKey', async () => {
    return agent.hasApiKey()
  })

  ipcMain.handle('agent:clearConversation', async () => {
    agent.clearHistory()
  })

  ipcMain.handle('agent:cancel', async () => {
    agent.cancel()
  })

  ipcMain.handle('agent:message', async (_, message: string) => {
    if (isProcessing) {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent:response', {
          type: 'error',
          content: 'Already processing a message. Please wait or cancel the current request.'
        })
      }
      return
    }

    const win = getWindow()
    if (!win || win.isDestroyed()) return

    if (!agent.hasApiKey()) {
      win.webContents.send('agent:response', {
        type: 'error',
        content: 'No API key set. Please set your Anthropic API key first.'
      })
      return
    }

    const folder = getCurrentFolder()
    if (!folder) {
      win.webContents.send('agent:response', {
        type: 'error',
        content: 'No project folder selected. Please select a folder first.'
      })
      return
    }

    isProcessing = true

    try {
      const systemPrompt = SYSTEM_PROMPT.replace('{{PROJECT_FOLDER}}', folder)

      const notifyToolUse = (tool: string, input: Record<string, unknown>): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('agent:toolUse', tool, input)
        }
      }

      const notifyStateChanged = (domain: string, data?: unknown): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('agent:stateChanged', domain, data)
        }
      }

      const mcpServer = createOrchestrateServer({
        getCurrentFolder,
        getTaskManager,
        getGitManager,
        getPtyManager: _getPtyManager,
        getWindow,
        notifyToolUse,
        notifyStateChanged
      })

      const generator = agent.sendMessage(message, systemPrompt, mcpServer, folder, allowedTools)

      for await (const chunk of generator) {
        if (win.isDestroyed()) break
        win.webContents.send('agent:response', chunk)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent:response', { type: 'error', content: errorMessage })
      }
    } finally {
      isProcessing = false
    }
  })
}
