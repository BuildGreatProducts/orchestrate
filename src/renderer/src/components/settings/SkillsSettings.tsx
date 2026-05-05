import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileInput, Pencil, PlugZap, Plus, Trash2, X } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import type {
  McpAuthType,
  McpServerConfig,
  McpServerInput,
  McpTransportType,
  SkillMeta
} from '@shared/types'

function ToggleCheck({
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
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={enabled}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-600 transition-colors hover:border-zinc-400"
      style={{ backgroundColor: enabled ? '#fff' : 'transparent' }}
    >
      {enabled && <Check size={11} className="text-zinc-900" aria-hidden="true" />}
    </button>
  )
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
      type="button"
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

function SkillItem({
  skill,
  onToggle,
  onRemove
}: {
  skill: SkillMeta
  onToggle: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
      <ToggleCheck
        enabled={skill.enabled}
        label={skill.enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
        onToggle={onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{skill.name}</div>
        {skill.description && (
          <div className="truncate text-xs text-zinc-500">{skill.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove skill"
        className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function AddSkillMenu({
  target,
  onClose
}: {
  target: 'global' | 'project'
  onClose: () => void
}): React.JSX.Element {
  const [showGitInput, setShowGitInput] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const addFromFolder = useSkillsStore((s) => s.addFromFolder)
  const addFromZip = useSkillsStore((s) => s.addFromZip)
  const addFromGit = useSkillsStore((s) => s.addFromGit)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleGitClone = async (): Promise<void> => {
    if (!gitUrl.trim()) return
    setIsCloning(true)
    try {
      await addFromGit(gitUrl.trim(), target)
      onClose()
    } finally {
      setIsCloning(false)
    }
  }

  if (showGitInput) {
    return (
      <div ref={menuRef} className="mt-1 flex gap-2">
        <input
          type="text"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGitClone()
            if (e.key === 'Escape') onClose()
            if (e.metaKey || e.ctrlKey) e.stopPropagation()
          }}
          placeholder="https://github.com/user/skill.git"
          className="min-w-0 flex-1 rounded bg-zinc-800/70 px-2 py-1 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-500 hover:bg-zinc-800 focus:bg-zinc-800"
          autoFocus
        />
        <button
          onClick={handleGitClone}
          disabled={!gitUrl.trim() || isCloning}
          className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          {isCloning ? 'Cloning...' : 'Clone'}
        </button>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div ref={menuRef} className="mt-1 rounded bg-zinc-800 py-1 shadow-lg">
      <button
        onClick={async () => {
          await addFromFolder(target)
          onClose()
        }}
        className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        Import Folder
      </button>
      <button
        onClick={async () => {
          await addFromZip(target)
          onClose()
        }}
        className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        Import Zip
      </button>
      <button
        onClick={() => setShowGitInput(true)}
        className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        Clone from Git
      </button>
    </div>
  )
}

function SkillGroup({
  title,
  skills,
  target
}: {
  title: string
  skills: SkillMeta[]
  target: 'global' | 'project'
}): React.JSX.Element {
  const [showMenu, setShowMenu] = useState(false)
  const toggleSkill = useSkillsStore((s) => s.toggleSkill)
  const removeSkill = useSkillsStore((s) => s.removeSkill)
  const openFolder = useSkillsStore((s) => s.openFolder)

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {skills.length === 0 ? (
        <p className="text-xs text-zinc-600">No skills installed</p>
      ) : (
        <div className="space-y-1">
          {skills.map((skill) => (
            <SkillItem
              key={skill.path}
              skill={skill}
              onToggle={() => toggleSkill(skill.path)}
              onRemove={() => removeSkill(skill.path)}
            />
          ))}
        </div>
      )}
      <div className="relative flex gap-2">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
        >
          <Plus size={12} />
          Add Skill
        </button>
        <button
          onClick={() => openFolder(target)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
        >
          Open Folder
        </button>
      </div>
      {showMenu && <AddSkillMenu target={target} onClose={() => setShowMenu(false)} />}
    </div>
  )
}

function parsePairs(value: string): Record<string, string> {
  const pairs: Record<string, string> = {}
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const index = line.indexOf('=')
    const key = index === -1 ? line : line.slice(0, index).trim()
    const val = index === -1 ? '' : line.slice(index + 1)
    if (key) pairs[key] = val
  }
  return pairs
}

function pairText(fields: { name: string }[]): string {
  return fields.map((field) => `${field.name}=`).join('\n')
}

type CursorMcpServerConfig = {
  url?: unknown
  headers?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  type?: unknown
  transport?: unknown
  authType?: unknown
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const result: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== 'string') {
      throw new Error(`${label}.${key} must be a string`)
    }
    result[key] = rawValue
  }
  return result
}

function parseCursorMcpJson(raw: string): McpServerInput[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP config must be a JSON object')
  }

  const mcpServers = (parsed as { mcpServers?: unknown }).mcpServers
  if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    throw new Error('MCP config must contain an mcpServers object')
  }

  const inputs: McpServerInput[] = []
  for (const [name, rawConfig] of Object.entries(mcpServers)) {
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      throw new Error(`mcpServers.${name} must be an object`)
    }
    const config = rawConfig as CursorMcpServerConfig
    const url = typeof config.url === 'string' ? config.url.trim() : ''
    const command = typeof config.command === 'string' ? config.command.trim() : ''
    const headers = parseStringRecord(config.headers, `${name}.headers`)
    const env = parseStringRecord(config.env, `${name}.env`)
    const rawArgs = config.args
    const args =
      rawArgs === undefined
        ? []
        : Array.isArray(rawArgs) && rawArgs.every((arg) => typeof arg === 'string')
          ? rawArgs
          : null
    if (!args) throw new Error(`${name}.args must be an array of strings`)

    const explicitTransport = config.transport ?? config.type
    const explicitAuth = config.authType
    if (url) {
      const transport =
        explicitTransport === 'sse' || explicitTransport === 'sse-http' ? 'sse' : 'streamable-http'
      const authType =
        explicitAuth === 'none' || explicitAuth === 'secret' || explicitAuth === 'oauth'
          ? explicitAuth
          : Object.keys(headers).length > 0
            ? 'secret'
            : 'oauth'
      inputs.push({
        name,
        transport,
        url,
        authType,
        headers,
        enabled: true
      })
    } else if (command) {
      inputs.push({
        name,
        transport: 'stdio',
        command,
        args,
        env,
        authType: 'none',
        enabled: true
      })
    } else {
      throw new Error(`${name} must define either url or command`)
    }
  }

  if (inputs.length === 0) throw new Error('No MCP servers found')
  return inputs
}

function McpServerForm({
  server,
  currentFolder,
  onClose
}: {
  server?: McpServerConfig
  currentFolder: string | null
  onClose: () => void
}): React.JSX.Element {
  const addServer = useMcpStore((s) => s.addServer)
  const updateServer = useMcpStore((s) => s.updateServer)
  const [name, setName] = useState(server?.name ?? '')
  const [transport, setTransport] = useState<McpTransportType>(server?.transport ?? 'stdio')
  const [command, setCommand] = useState(server?.command ?? '')
  const [args, setArgs] = useState((server?.args ?? []).join('\n'))
  const [cwd, setCwd] = useState(server?.cwd ?? '')
  const [url, setUrl] = useState(server?.url ?? '')
  const [authType, setAuthType] = useState<McpAuthType>(server?.authType ?? 'none')
  const [env, setEnv] = useState(server ? pairText(server.env) : '')
  const [headers, setHeaders] = useState(server ? pairText(server.headers) : '')
  const [isSaving, setIsSaving] = useState(false)

  const isRemote = transport === 'streamable-http' || transport === 'sse'
  const canSave = name.trim() && (isRemote ? url.trim() : command.trim())

  const toInput = (): McpServerInput => ({
    name: name.trim(),
    transport,
    enabled: true,
    command: command.trim(),
    args: args
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    cwd: cwd.trim(),
    url: url.trim(),
    authType,
    env: parsePairs(env),
    headers: parsePairs(headers)
  })

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    try {
      if (server) await updateServer(server.id, toInput(), currentFolder)
      else await addServer(toInput(), currentFolder)
      onClose()
    } catch {
      // Store owns the visible error message.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-200">{server ? 'Edit MCP' : 'Add MCP'}</h3>
        <button
          type="button"
          aria-label="Close MCP form"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={14} />
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
      />
      <select
        value={transport}
        onChange={(e) => setTransport(e.target.value as McpTransportType)}
        className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:bg-zinc-800"
      >
        <option value="stdio">stdio</option>
        <option value="streamable-http">streamable-http</option>
        <option value="sse">sse</option>
      </select>
      {isRemote ? (
        <>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
          />
          <select
            value={authType}
            onChange={(e) => setAuthType(e.target.value as McpAuthType)}
            className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:bg-zinc-800"
          >
            <option value="none">No auth</option>
            <option value="secret">Static headers</option>
            <option value="oauth">OAuth</option>
          </select>
          {authType === 'secret' && (
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder="Authorization=Bearer ..."
              rows={3}
              className="w-full resize-none rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
            />
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Command"
            className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
          />
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="One argument per line"
            rows={3}
            className="w-full resize-none rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
          />
          <input
            type="text"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="Working directory"
            className="w-full rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
          />
          <textarea
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder="API_KEY=..."
            rows={3}
            className="w-full resize-none rounded bg-zinc-800/70 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
          />
        </>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onClose}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function McpServerItem({
  server,
  enabled,
  currentFolder,
  onEdit
}: {
  server: McpServerConfig
  enabled: boolean
  currentFolder: string | null
  onEdit: () => void
}): React.JSX.Element {
  const setProjectEnabled = useMcpStore((s) => s.setProjectEnabled)
  const testServer = useMcpStore((s) => s.testServer)
  const startOAuth = useMcpStore((s) => s.startOAuth)
  const removeServer = useMcpStore((s) => s.removeServer)
  const status = server.status
  const statusLabel =
    status?.state === 'connected'
      ? `${status.toolCount ?? 0} tools`
      : status?.state === 'auth-required'
        ? 'Auth required'
        : status?.state === 'error'
          ? 'Error'
          : 'Not tested'

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-start gap-3">
        <ToggleSwitch
          enabled={enabled}
          label={
            enabled ? `Disable ${server.name} for project` : `Enable ${server.name} for project`
          }
          onToggle={() => {
            if (currentFolder) setProjectEnabled(currentFolder, server.id, !enabled)
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">{server.name}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
              {server.transport}
            </span>
            {server.authType === 'oauth' && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                OAuth
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {server.transport === 'stdio'
              ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
              : server.url}
          </div>
          <div className="mt-1 text-xs text-zinc-600">{statusLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {server.authType === 'oauth' && (
            <button
              type="button"
              onClick={() => startOAuth(server.id, currentFolder)}
              aria-label={`Connect ${server.name}`}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <PlugZap size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => testServer(server.id, currentFolder)}
            className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            Test
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${server.name}`}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => removeServer(server.id, currentFolder)}
            aria-label={`Remove ${server.name}`}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function CursorMcpImportPanel({
  currentFolder,
  servers,
  onClose
}: {
  currentFolder: string | null
  servers: McpServerConfig[]
  onClose: () => void
}): React.JSX.Element {
  const importServers = useMcpStore((s) => s.importServers)
  const [rawJson, setRawJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  const parsedImport = useMemo<{ preview: McpServerInput[]; error: string | null }>(() => {
    if (!rawJson.trim()) return { preview: [], error: null }
    try {
      return { preview: parseCursorMcpJson(rawJson), error: null }
    } catch (err) {
      return { preview: [], error: err instanceof Error ? err.message : String(err) }
    }
  }, [rawJson])
  const preview = parsedImport.preview
  const error = importError ?? parsedImport.error

  const existingNames = useMemo(
    () => new Set(servers.map((server) => server.name.trim().toLowerCase())),
    [servers]
  )

  const loadCursorFile = async (): Promise<void> => {
    setIsLoadingFile(true)
    setImportError(null)
    try {
      const content = await window.orchestrate.readFile('.cursor/mcp.json')
      setRawJson(content)
    } catch (err) {
      setImportError(
        `Could not read .cursor/mcp.json: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setIsLoadingFile(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (preview.length === 0 || !currentFolder) return
    setIsImporting(true)
    try {
      await importServers(preview, currentFolder)
      onClose()
    } catch {
      // Store owns the visible error message; keep this panel open for edits.
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Import MCP JSON</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Paste Cursor-style MCP config or load this project&apos;s .cursor/mcp.json.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close MCP import"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={loadCursorFile}
          disabled={isLoadingFile}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-40"
        >
          <FileInput size={13} />
          {isLoadingFile ? 'Loading...' : 'Load .cursor/mcp.json'}
        </button>
      </div>
      <textarea
        value={rawJson}
        onChange={(e) => {
          setImportError(null)
          setRawJson(e.target.value)
        }}
        placeholder={`{
  "mcpServers": {
    "Figma": {
      "url": "https://mcp.figma.com/mcp",
      "headers": {}
    }
  }
}`}
        rows={10}
        className="w-full resize-none rounded bg-zinc-800/70 px-3 py-2 font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:bg-zinc-800"
      />
      {error && (
        <p
          role="alert"
          className="rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400"
        >
          {error}
        </p>
      )}
      {preview.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Preview</h4>
          {preview.map((server) => {
            const willUpdate = existingNames.has(server.name.trim().toLowerCase())
            return (
              <div
                key={server.name}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-200">{server.name}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {server.transport === 'stdio' ? server.command : server.url}
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <div className="text-xs text-zinc-500">{server.transport}</div>
                  <div className="text-xs text-zinc-600">
                    {willUpdate ? 'Update' : 'Add'} · {server.authType}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleImport}
          disabled={preview.length === 0 || isImporting || !currentFolder}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30"
        >
          {isImporting ? 'Importing...' : `Import ${preview.length || ''}`.trim()}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function SkillsTab(): React.JSX.Element {
  const skills = useSkillsStore((s) => s.skills)
  const isLoading = useSkillsStore((s) => s.isLoading)
  const error = useSkillsStore((s) => s.error)
  const loadSkills = useSkillsStore((s) => s.loadSkills)

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const globalSkills = skills.filter((s) => s.source === 'global')
  const projectSkills = skills.filter((s) => s.source === 'project')

  return (
    <div className="mx-auto w-full max-w-md space-y-6 text-left">
      {error && (
        <p
          role="alert"
          className="rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400"
        >
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading skills...</p>
      ) : (
        <>
          <SkillGroup
            title="Global skills (~/.orchestrate/skills/)"
            skills={globalSkills}
            target="global"
          />
          <SkillGroup title="Project skills (.skills/)" skills={projectSkills} target="project" />
        </>
      )}
      <p className="text-xs text-zinc-500">
        Learn more about the{' '}
        <a
          href="https://agentskills.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 underline hover:text-zinc-300"
        >
          Agent Skills
        </a>{' '}
        open standard.
      </p>
    </div>
  )
}

function McpTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const servers = useMcpStore((s) => s.servers)
  const project = useMcpStore((s) => s.project)
  const isLoading = useMcpStore((s) => s.isLoading)
  const error = useMcpStore((s) => s.error)
  const loadRegistry = useMcpStore((s) => s.loadRegistry)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadRegistry(currentFolder)
  }, [currentFolder, loadRegistry])

  const enabledIds = useMemo(() => new Set(project?.enabledServerIds ?? []), [project])
  const editing = servers.find((server) => server.id === editingId)

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 text-left">
      {error && (
        <p
          role="alert"
          className="rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400"
        >
          {error}
        </p>
      )}
      {showImport ? (
        <CursorMcpImportPanel
          currentFolder={currentFolder}
          servers={servers}
          onClose={() => setShowImport(false)}
        />
      ) : showForm || editing ? (
        <McpServerForm
          server={editing}
          currentFolder={currentFolder}
          onClose={() => {
            setShowForm(false)
            setEditingId(null)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            <Plus size={13} />
            Add MCP
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            <FileInput size={13} />
            Import JSON
          </button>
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-zinc-500">Loading MCPs...</p>
      ) : servers.length === 0 ? (
        <p className="text-sm text-zinc-600">No MCP servers added</p>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <McpServerItem
              key={server.id}
              server={server}
              enabled={enabledIds.has(server.id)}
              currentFolder={currentFolder}
              onEdit={() => {
                setShowForm(false)
                setShowImport(false)
                setEditingId(server.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function SkillsSettings(): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-8">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Skills</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-500">
            Skills extend project agents with focused knowledge and reusable workflows.
          </p>
        </div>

        <div className="mt-8">
          <SkillsTab />
        </div>
      </div>
    </div>
  )
}

export function McpSettings(): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-8">
        <div className="text-center">
          <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">MCP</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-500">
            MCPs give project agents access to authenticated tools through Orchestrate.
          </p>
        </div>

        <div className="mt-8">
          <McpTab />
        </div>
      </div>
    </div>
  )
}
