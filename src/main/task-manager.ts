import { readFile, writeFile, mkdir, unlink, rename } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { nanoid } from 'nanoid'
import type {
  AgentType,
  BoardState,
  ColumnId,
  SimpleTask,
  SimpleTaskRun,
  TaskListState,
  TaskMode,
  TaskRun,
  TaskSchedule,
  TaskStatus
} from '@shared/types'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const EXPECTED_COLUMNS: ColumnId[] = ['planning', 'in-progress', 'review', 'done']

const EMPTY_TASKS: TaskListState = {
  version: 1,
  order: [],
  tasks: {}
}

const EMPTY_BOARD: BoardState = {
  columns: {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function isValidSchedule(value: unknown): value is TaskSchedule {
  if (!isRecord(value)) return false
  return typeof value.enabled === 'boolean' && typeof value.cron === 'string'
}

function defaultBranchName(id: string): string {
  return `orchestrate/task-${id.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

function normalizeMode(value: unknown): TaskMode {
  return value === 'plan' ? 'plan' : 'build'
}

function normalizeStatus(value: unknown): TaskStatus {
  if (value === 'running' || value === 'review' || value === 'done' || value === 'failed') {
    return value
  }
  return 'todo'
}

function normalizeAgent(value: unknown): AgentType {
  return typeof value === 'string' && value.trim() ? value.trim() : 'claude-code'
}

function normalizeSimpleRun(value: unknown): SimpleTaskRun | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.id !== 'string' || typeof value.startedAt !== 'string') return undefined
  const status =
    value.status === 'completed' || value.status === 'failed' ? value.status : 'running'
  return {
    id: value.id,
    startedAt: value.startedAt,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : undefined,
    status,
    terminalId: typeof value.terminalId === 'string' ? value.terminalId : undefined,
    worktreePath: typeof value.worktreePath === 'string' ? value.worktreePath : undefined,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : undefined
  }
}

function normalizeLegacyRun(value: unknown): SimpleTaskRun | undefined {
  if (!isRecord(value)) return undefined
  const run = value as Partial<TaskRun> & { terminalId?: unknown; worktreePath?: unknown }
  if (typeof run.id !== 'string' || typeof run.startedAt !== 'string') return undefined
  const terminalId =
    typeof run.terminalId === 'string'
      ? run.terminalId
      : Array.isArray(run.stepResults)
        ? run.stepResults.at(-1)?.terminalId
        : undefined
  const failedStep = Array.isArray(run.stepResults)
    ? run.stepResults.find((step) => typeof step.exitCode === 'number' && step.exitCode !== 0)
    : undefined
  return {
    id: run.id,
    startedAt: run.startedAt,
    finishedAt: typeof run.finishedAt === 'string' ? run.finishedAt : undefined,
    status: run.status === 'completed' || run.status === 'failed' ? run.status : 'failed',
    terminalId,
    worktreePath: typeof run.worktreePath === 'string' ? run.worktreePath : undefined,
    exitCode: failedStep?.exitCode ?? (run.status === 'completed' ? 0 : undefined)
  }
}

function stripMarkdownHeading(content: string, title: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  if (lines[0]?.trim().replace(/^#+\s*/, '') === title.trim()) {
    lines.shift()
  }
  return lines.join('\n').trim()
}

function isValidBoard(obj: unknown): obj is BoardState {
  if (!isRecord(obj) || !isRecord(obj.columns) || !isRecord(obj.tasks)) return false
  for (const key of EXPECTED_COLUMNS) {
    if (!Array.isArray(obj.columns[key])) return false
  }
  for (const val of Object.values(obj.tasks)) {
    if (!isRecord(val)) return false
    if (typeof val.title !== 'string' || typeof val.createdAt !== 'string') return false
  }
  return true
}

function normalizeTaskList(value: unknown): TaskListState | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.tasks)) return null
  const order = Array.isArray(value.order)
    ? value.order.filter((id): id is string => typeof id === 'string')
    : []
  const tasks: Record<string, SimpleTask> = {}

  for (const [id, rawTask] of Object.entries(value.tasks)) {
    if (!SAFE_ID_RE.test(id) || !isRecord(rawTask)) continue
    const prompt = typeof rawTask.prompt === 'string' ? rawTask.prompt.trim() : ''
    if (!prompt) continue
    const createdAt =
      typeof rawTask.createdAt === 'string' ? rawTask.createdAt : new Date().toISOString()
    const updatedAt = typeof rawTask.updatedAt === 'string' ? rawTask.updatedAt : createdAt
    const schedule = isValidSchedule(rawTask.schedule) ? rawTask.schedule : undefined
    const branchName =
      typeof rawTask.branchName === 'string' && rawTask.branchName.trim()
        ? rawTask.branchName.trim()
        : defaultBranchName(id)

    tasks[id] = {
      id,
      prompt,
      mode: normalizeMode(rawTask.mode),
      status: normalizeStatus(rawTask.status),
      branchName,
      agentType: normalizeAgent(rawTask.agentType),
      pinned: rawTask.pinned === true,
      schedule,
      createdAt,
      updatedAt,
      lastRun: normalizeSimpleRun(rawTask.lastRun)
    }
  }

  const dedupedOrder = order.filter((id, index) => tasks[id] && order.indexOf(id) === index)
  for (const id of Object.keys(tasks)) {
    if (!dedupedOrder.includes(id)) dedupedOrder.push(id)
  }

  return { version: 1, order: dedupedOrder, tasks }
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

  private migrateBoard(obj: Record<string, unknown>): void {
    const cols = obj.columns as Record<string, unknown> | undefined
    if (!cols) return
    const draft = cols['draft']
    if (Array.isArray(draft)) {
      if (!Array.isArray(cols['planning'])) {
        cols['planning'] = []
      }
      ;(cols['planning'] as string[]).unshift(...(draft as string[]))
      delete cols['draft']
    }
  }

  private async loadLegacyBoard(): Promise<BoardState> {
    try {
      const raw = await readFile(join(this.tasksDir, 'board.json'), 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) this.migrateBoard(parsed)
      if (!isValidBoard(parsed)) return structuredClone(EMPTY_BOARD)
      return parsed
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return structuredClone(EMPTY_BOARD)
      if (err instanceof SyntaxError) return structuredClone(EMPTY_BOARD)
      throw err
    }
  }

  private legacyColumnStatus(column: ColumnId): TaskStatus {
    if (column === 'review') return 'review'
    if (column === 'done') return 'done'
    if (column === 'in-progress') return 'failed'
    return 'todo'
  }

  private async migrateLegacyBoardToTasks(): Promise<TaskListState> {
    const board = await this.loadLegacyBoard()
    const tasks: Record<string, SimpleTask> = {}
    const order: string[] = []

    for (const column of EXPECTED_COLUMNS) {
      for (const id of board.columns[column]) {
        const task = board.tasks[id]
        if (!task || tasks[id] || !SAFE_ID_RE.test(id)) continue

        const markdown = await this.readMarkdown(id).catch(() => '')
        const promptFromMarkdown = stripMarkdownHeading(markdown, task.title)
        const firstStep = Array.isArray(task.steps)
          ? task.steps.find((step) => step.prompt.trim())
          : undefined
        const prompt = promptFromMarkdown || firstStep?.prompt.trim() || task.title
        const rawTask = task as typeof task & {
          mode?: unknown
          status?: unknown
          worktree?: { branchName?: unknown }
        }

        tasks[id] = {
          id,
          prompt,
          mode: normalizeMode(rawTask.mode),
          status: normalizeStatus(rawTask.status ?? this.legacyColumnStatus(column)),
          branchName:
            typeof rawTask.worktree?.branchName === 'string' && rawTask.worktree.branchName.trim()
              ? rawTask.worktree.branchName.trim()
              : defaultBranchName(id),
          agentType: normalizeAgent(task.agentType),
          pinned: false,
          schedule: isValidSchedule(task.schedule) ? task.schedule : undefined,
          createdAt: task.createdAt,
          updatedAt: task.createdAt,
          lastRun: normalizeLegacyRun(task.lastRun)
        }
        order.push(id)
      }
    }

    return { version: 1, order, tasks }
  }

  async loadTasks(): Promise<TaskListState> {
    await this.ensureDir()
    try {
      const raw = await readFile(join(this.tasksDir, 'tasks.json'), 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      const normalized = normalizeTaskList(parsed)
      return normalized ?? structuredClone(EMPTY_TASKS)
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        const migrated = await this.migrateLegacyBoardToTasks()
        await this.saveTasks(migrated)
        return migrated
      }
      if (err instanceof SyntaxError) {
        console.error('[TaskManager] tasks.json is not valid JSON, returning empty task list')
        return structuredClone(EMPTY_TASKS)
      }
      throw err
    }
  }

  async saveTasks(tasks: TaskListState): Promise<void> {
    await this.ensureDir()
    const normalized = normalizeTaskList(tasks) ?? structuredClone(EMPTY_TASKS)
    const tmpPath = join(this.tasksDir, 'tasks.json.tmp')
    const finalPath = join(this.tasksDir, 'tasks.json')
    try {
      await writeFile(tmpPath, JSON.stringify(normalized, null, 2), 'utf-8')
      await rename(tmpPath, finalPath)
    } catch (err) {
      await unlink(tmpPath).catch(() => {})
      throw err
    }
  }

  async loadBoard(): Promise<BoardState> {
    return this.loadLegacyBoard()
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
      if (isNodeError(err) && err.code === 'ENOENT') return ''
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
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
  }

  generateId(): string {
    return nanoid(8)
  }
}
