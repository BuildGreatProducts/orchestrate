import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAgentsStore } from '@renderer/stores/agents'
import type { AgentConfig } from '@shared/types'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function ToggleSwitch({
  enabled,
  label,
  onToggle
}: {
  enabled: boolean
  label: string
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
        enabled ? 'bg-white' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-all ${
          enabled ? 'translate-x-4 bg-zinc-900' : 'translate-x-0 bg-zinc-500'
        }`}
      />
    </button>
  )
}

function AgentToggle({
  agent,
  onToggle,
  note
}: {
  agent: AgentConfig
  onToggle: (id: string, enabled: boolean) => void
  note?: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-sm text-zinc-300">{agent.displayName}</span>
        {note && <p className="text-xs text-zinc-500">{note}</p>}
      </div>
      <ToggleSwitch
        enabled={agent.enabled}
        label={`Toggle ${agent.displayName}`}
        onToggle={() => onToggle(agent.id, !agent.enabled)}
      />
    </div>
  )
}

export default function SettingsPage(): React.JSX.Element {
  const [version, setVersion] = useState<string>('')
  const [defaultUrl, setDefaultUrl] = useState<string>('')
  const [savedUrl, setSavedUrl] = useState<string>('')

  const agents = useAgentsStore((s) => s.agents)
  const setAgentEnabled = useAgentsStore((s) => s.setAgentEnabled)
  const addCustomAgent = useAgentsStore((s) => s.addCustomAgent)
  const removeCustomAgent = useAgentsStore((s) => s.removeCustomAgent)
  const updateCustomAgent = useAgentsStore((s) => s.updateCustomAgent)

  const builtinAgents = agents.filter((a) => a.builtin)
  const customAgents = agents.filter((a) => !a.builtin)

  const [addingCustom, setAddingCustom] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [customCommand, setCustomCommand] = useState('')

  useEffect(() => {
    setVersion(navigator.userAgent.match(/Orchestrate\/([^\s]+)/)?.[1] ?? '1.0.0')
    window.orchestrate
      .getSetting('defaultBrowserUrl')
      .then((val) => {
        const url = typeof val === 'string' && val.trim() ? val.trim() : 'http://localhost:3000'
        setDefaultUrl(url)
        setSavedUrl(url)
      })
      .catch(() => {
        const url = 'http://localhost:3000'
        setDefaultUrl(url)
        setSavedUrl(url)
      })
  }, [])

  const handleSaveUrl = async (): Promise<void> => {
    const trimmed = defaultUrl.trim() || 'http://localhost:3000'
    try {
      await window.orchestrate.setSetting('defaultBrowserUrl', trimmed)
      setDefaultUrl(trimmed)
      setSavedUrl(trimmed)
    } catch (err) {
      console.error('[Settings] Failed to save default browser URL:', err)
    }
  }

  const handleAddCustomAgent = async (): Promise<void> => {
    const name = customName.trim()
    const command = customCommand.trim()
    if (!name || !command) return
    const id = slugify(name)
    if (!id) {
      console.error('[Settings] Agent name must contain at least one letter or number')
      return
    }
    if (agents.some((a) => a.id === id)) {
      console.error('[Settings] Agent with this name already exists')
      return
    }
    await addCustomAgent({
      id,
      displayName: name,
      cliCommand: command,
      enabled: true,
      mcpMode: 'none',
      commandTemplate: `${command} {prompt}`
    })
    setCustomName('')
    setCustomCommand('')
    setAddingCustom(false)
  }

  const handleUpdateCustomAgent = async (id: string): Promise<void> => {
    const name = customName.trim()
    const command = customCommand.trim()
    if (!name || !command) return
    await updateCustomAgent(id, {
      displayName: name,
      cliCommand: command,
      commandTemplate: `${command} {prompt}`
    })
    setEditingId(null)
    setCustomName('')
    setCustomCommand('')
  }

  const startEdit = (agent: AgentConfig): void => {
    setEditingId(agent.id)
    setCustomName(agent.displayName)
    setCustomCommand(agent.cliCommand)
    setAddingCustom(false)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setAddingCustom(false)
    setCustomName('')
    setCustomCommand('')
  }

  const isDirty = defaultUrl !== savedUrl

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">General application preferences.</p>
        </div>

        {/* Agents section */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Agents</h3>

          {/* Built-in agents */}
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <label className="block text-sm font-medium text-zinc-300">Built-in Agents</label>
            <p className="mt-0.5 text-xs text-zinc-500">
              Toggle agents to show them in task, loop, and new agent menus.
            </p>
            <div className="mt-2 divide-y divide-zinc-800">
              {builtinAgents.map((agent) => (
                <AgentToggle
                  key={agent.id}
                  agent={agent}
                  onToggle={setAgentEnabled}
                  note={agent.mcpMode !== 'none' ? 'Has access to Orchestrate MCP tools' : undefined}
                />
              ))}
            </div>
          </div>

          {/* Custom agents */}
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <label className="block text-sm font-medium text-zinc-300">Custom Agents</label>
            <p className="mt-0.5 text-xs text-zinc-500">
              Add your own CLI agents by specifying a name and command.
            </p>

            {customAgents.length > 0 && (
              <div className="mt-2 divide-y divide-zinc-800">
                {customAgents.map((agent) =>
                  editingId === agent.id ? (
                    <div key={agent.id} className="space-y-2 py-2">
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateCustomAgent(agent.id)
                          if (e.key === 'Escape') cancelEdit()
                          if (e.metaKey || e.ctrlKey) e.stopPropagation()
                        }}
                        placeholder="Agent name"
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateCustomAgent(agent.id)
                          if (e.key === 'Escape') cancelEdit()
                          if (e.metaKey || e.ctrlKey) e.stopPropagation()
                        }}
                        placeholder="CLI command (e.g. aider)"
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateCustomAgent(agent.id)}
                          disabled={!customName.trim() || !customCommand.trim()}
                          className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-30"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={agent.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <span className="text-sm text-zinc-300">{agent.displayName}</span>
                        <span className="ml-2 text-xs text-zinc-500">{agent.cliCommand}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="mr-2">
                          <ToggleSwitch
                            enabled={agent.enabled}
                            label={`Toggle ${agent.displayName}`}
                            onToggle={() => setAgentEnabled(agent.id, !agent.enabled)}
                          />
                        </div>
                        <button
                          onClick={() => startEdit(agent)}
                          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removeCustomAgent(agent.id)}
                          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {addingCustom ? (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomAgent()
                    if (e.key === 'Escape') cancelEdit()
                    if (e.metaKey || e.ctrlKey) e.stopPropagation()
                  }}
                  placeholder="Agent name"
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                  autoFocus
                />
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomAgent()
                    if (e.key === 'Escape') cancelEdit()
                    if (e.metaKey || e.ctrlKey) e.stopPropagation()
                  }}
                  placeholder="CLI command (e.g. aider)"
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCustomAgent}
                    disabled={!customName.trim() || !customCommand.trim()}
                    className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-30"
                  >
                    Add
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddingCustom(true)
                  setEditingId(null)
                  setCustomName('')
                  setCustomCommand('')
                }}
                className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                <Plus size={14} />
                Add custom agent
              </button>
            )}
          </div>
        </div>

        {/* Browser section */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Browser</h3>
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <label className="block text-sm text-zinc-300">Default URL</label>
            <p className="mt-0.5 text-xs text-zinc-500">
              The URL opened when creating a new browser tab.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={defaultUrl}
                onChange={(e) => setDefaultUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveUrl()
                  if (e.metaKey || e.ctrlKey) e.stopPropagation()
                }}
                placeholder="http://localhost:3000"
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleSaveUrl}
                disabled={!isDirty}
                className="rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* About section */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">About</h3>
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Orchestrate</span>
              <span className="text-xs text-zinc-500">v{version}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              AI agent orchestration for your projects.
            </p>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Keyboard Shortcuts
          </h3>
          <div className="space-y-1">
            {[
              { keys: '\u2318/Ctrl + T', action: 'New agent' },
              { keys: '\u2318/Ctrl + N', action: 'New task' },
              { keys: '\u2318/Ctrl + S', action: 'Save file / focus save point' },
              { keys: '\u2318/Ctrl + 1-5', action: 'Switch pages' }
            ].map(({ keys, action }) => (
              <div
                key={action}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-2"
              >
                <span className="text-sm text-zinc-400">{action}</span>
                <kbd className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
