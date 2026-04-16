import { readFile, writeFile, mkdir, unlink, rename, readdir } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { homedir } from 'os'
import { nanoid } from 'nanoid'
import type { SavedCommand, CommandScope } from '@shared/types'
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export const GLOBAL_COMMANDS_DIR = join(homedir(), '.orchestrate', 'commands')

export function validateCommandId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid command ID: ${String(id)}`)
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

function getProjectCommandsDir(projectFolder: string): string {
  return join(projectFolder, '.orchestrate', 'commands')
}

function getDirForScope(scope: CommandScope, projectFolder?: string | null): string {
  if (scope === 'global') return GLOBAL_COMMANDS_DIR
  if (!projectFolder) throw new Error('No project folder selected for project-scoped command')
  return getProjectCommandsDir(projectFolder)
}

function validateId(id: string, dir: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid command ID: ${id}`)
  }
  const target = resolve(dir, `${id}.json`)
  const rel = relative(dir, target)
  if (rel.startsWith('..') || rel.startsWith(sep)) {
    throw new Error('Command ID resolves outside commands directory')
  }
}

async function scanDirectory(dir: string, scope: CommandScope): Promise<SavedCommand[]> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return []
    throw err
  }

  const commands: SavedCommand[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      const cmd = JSON.parse(raw)
      if (
        !cmd || typeof cmd !== 'object' ||
        typeof cmd.id !== 'string' || !cmd.id ||
        typeof cmd.name !== 'string' || !cmd.name ||
        !Array.isArray(cmd.commands) ||
        typeof cmd.createdAt !== 'string' ||
        typeof cmd.updatedAt !== 'string'
      ) {
        console.warn(`[Commands] Skipping malformed file: ${file}`)
        continue
      }
      cmd.scope = scope
      commands.push(cmd as SavedCommand)
    } catch {
      console.warn(`[Commands] Skipping unreadable file: ${file}`)
    }
  }
  return commands
}

export async function listCommands(projectFolder?: string | null): Promise<SavedCommand[]> {
  const globalCommands = await scanDirectory(GLOBAL_COMMANDS_DIR, 'global')

  let projectCommands: SavedCommand[] = []
  if (projectFolder) {
    projectCommands = await scanDirectory(getProjectCommandsDir(projectFolder), 'project')
  }

  const all = [...projectCommands, ...globalCommands]
  all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return all
}

export async function loadCommand(id: string, scope: CommandScope, projectFolder?: string | null): Promise<SavedCommand | null> {
  const dir = getDirForScope(scope, projectFolder)
  validateId(id, dir)
  try {
    const raw = await readFile(join(dir, `${id}.json`), 'utf-8')
    const cmd = JSON.parse(raw)
    if (
      !cmd || typeof cmd !== 'object' ||
      typeof cmd.id !== 'string' || !cmd.id ||
      typeof cmd.name !== 'string' || !cmd.name ||
      !Array.isArray(cmd.commands) ||
      typeof cmd.createdAt !== 'string' ||
      typeof cmd.updatedAt !== 'string'
    ) {
      console.warn(`[Commands] Malformed command file: ${id}.json`)
      return null
    }
    cmd.scope = scope
    return cmd as SavedCommand
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return null
    throw err
  }
}

export async function saveCommand(command: SavedCommand, projectFolder?: string | null): Promise<void> {
  const dir = getDirForScope(command.scope, projectFolder)
  validateId(command.id, dir)
  await mkdir(dir, { recursive: true })
  const tmpPath = join(dir, `${command.id}.json.tmp`)
  const finalPath = join(dir, `${command.id}.json`)
  try {
    await writeFile(tmpPath, JSON.stringify(command, null, 2), 'utf-8')
    await rename(tmpPath, finalPath)
  } catch (err) {
    await unlink(tmpPath).catch(() => {})
    throw err
  }
}

export async function deleteCommand(id: string, scope: CommandScope, projectFolder?: string | null): Promise<void> {
  const dir = getDirForScope(scope, projectFolder)
  validateId(id, dir)
  try {
    await unlink(join(dir, `${id}.json`))
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') return
    throw err
  }
}

export function generateCommandId(): string {
  return nanoid(8)
}
