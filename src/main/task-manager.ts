import { readFile, writeFile, mkdir, unlink, rename } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { nanoid } from 'nanoid'
import type { BoardState, ColumnId } from '@shared/types'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const EXPECTED_COLUMNS: ColumnId[] = ['draft', 'planning', 'in-progress', 'review', 'done']

const EMPTY_BOARD: BoardState = {
  columns: {
    draft: [],
    planning: [],
    'in-progress': [],
    review: [],
    done: []
  },
  tasks: {}
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

function isValidBoard(obj: unknown): obj is BoardState {
  if (!obj || typeof obj !== 'object') return false
  const board = obj as Record<string, unknown>
  if (!board.columns || typeof board.columns !== 'object') return false
  if (!board.tasks || typeof board.tasks !== 'object') return false
  const cols = board.columns as Record<string, unknown>
  for (const key of EXPECTED_COLUMNS) {
    if (!Array.isArray(cols[key])) return false
  }
  const tasks = board.tasks as Record<string, unknown>
  for (const val of Object.values(tasks)) {
    if (!val || typeof val !== 'object') return false
    const meta = val as Record<string, unknown>
    if (typeof meta.title !== 'string' || typeof meta.createdAt !== 'string') return false
  }
  return true
}

export class TaskManager {
  private tasksDir: string

  constructor(projectFolder: string) {
    this.tasksDir = join(projectFolder, 'tasks')
  }

  setProjectFolder(folder: string): void {
    this.tasksDir = join(folder, 'tasks')
  }

  private validateId(id: string): void {
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`Invalid task ID: ${id}`)
    }
    const target = resolve(this.tasksDir, `task-${id}.md`)
    const rel = relative(this.tasksDir, target)
    if (rel.startsWith('..') || rel.startsWith(sep)) {
      throw new Error('Task ID resolves outside tasks directory')
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true })
  }

  async loadBoard(): Promise<BoardState> {
    await this.ensureDir()
    try {
      const raw = await readFile(join(this.tasksDir, 'board.json'), 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!isValidBoard(parsed)) {
        console.error('[TaskManager] board.json failed validation, returning empty board')
        return structuredClone(EMPTY_BOARD)
      }
      return parsed
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return structuredClone(EMPTY_BOARD)
      }
      if (err instanceof SyntaxError) {
        console.error('[TaskManager] board.json is not valid JSON, returning empty board')
        return structuredClone(EMPTY_BOARD)
      }
      throw err
    }
  }

  async saveBoard(board: BoardState): Promise<void> {
    await this.ensureDir()
    const tmpPath = join(this.tasksDir, 'board.json.tmp')
    const finalPath = join(this.tasksDir, 'board.json')
    try {
      await writeFile(tmpPath, JSON.stringify(board, null, 2), 'utf-8')
      await rename(tmpPath, finalPath)
    } catch (err) {
      await unlink(tmpPath).catch(() => {})
      throw err
    }
  }

  async readMarkdown(id: string): Promise<string> {
    this.validateId(id)
    try {
      return await readFile(join(this.tasksDir, `task-${id}.md`), 'utf-8')
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return ''
      }
      throw err
    }
  }

  async writeMarkdown(id: string, content: string): Promise<void> {
    this.validateId(id)
    await this.ensureDir()
    await writeFile(join(this.tasksDir, `task-${id}.md`), content, 'utf-8')
  }

  async deleteMarkdown(id: string): Promise<void> {
    this.validateId(id)
    try {
      await unlink(join(this.tasksDir, `task-${id}.md`))
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return
      }
      throw err
    }
  }

  generateId(): string {
    return nanoid(8)
  }
}
