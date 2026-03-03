import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { markChannelRegistered } from './stubs'
import { Agent } from '../agent/agent'
import { createOrchestrateServer, ORCHESTRATE_TOOL_NAMES } from '../agent/tools'
import { SYSTEM_PROMPT } from '../agent/system-prompt'
import type { TaskManager } from '../task-manager'
import type { GitManager } from '../git-manager'
import type { PtyManager } from '../pty-manager'
import type { SkillManager } from '../skill-manager'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
  _getPtyManager: () => PtyManager | null,
  getSkillManager: () => SkillManager | null
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
      // Build skills section for system prompt
      let skillsSection = ''
      const skillMgr = getSkillManager()
      if (skillMgr) {
        try {
          const skills = await skillMgr.discoverSkills(folder)
          const enabledSkills = skills.filter((s) => s.enabled)
          if (enabledSkills.length > 0) {
            const skillsXml = enabledSkills
              .map(
                (s) =>
                  `  <skill>\n    <name>${escapeXml(s.name)}</name>\n    <description>${escapeXml(s.description)}</description>\n  </skill>`
              )
              .join('\n')
            skillsSection = `## Agent Skills
You have access to specialized skills. To use a skill, call activate_skill with the skill name.

<available_skills>
${skillsXml}
</available_skills>`
          }
        } catch (err) {
          console.error('[Agent] Failed to discover skills:', err)
        }
      }

      const systemPrompt = SYSTEM_PROMPT.replace('{{PROJECT_FOLDER}}', folder).replace(
        '{{AVAILABLE_SKILLS}}',
        skillsSection
      )

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
        getSkillManager: () => getSkillManager(),
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
