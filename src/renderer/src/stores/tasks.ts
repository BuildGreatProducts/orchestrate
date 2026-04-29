import { create } from 'zustand'
import type {
  AgentType,
  BoardState,
  ColumnId,
  CreateSimpleTaskInput,
  SimpleTask,
  SimpleTaskRun,
  TaskListState,
  TaskStatus,
  UpdateSimpleTaskInput
} from '@shared/types'
import { toast } from './toast'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const EMPTY_TASKS: TaskListState = {
  version: 1,
  order: [],
  tasks: {}
}

const LEGACY_COLUMNS: ColumnId[] = ['planning', 'in-progress', 'review', 'done']

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function defaultTaskBranch(id: string): string {
  return `orchestrate/task-${id.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

function normalizePrompt(prompt: string): string {
  return prompt.trim()
}

function cloneTasksWithTask(taskList: TaskListState, task: SimpleTask): TaskListState {
  return {
    ...taskList,
    tasks: {
      ...taskList.tasks,
      [task.id]: task
    }
  }
}

function legacyStatusForColumn(column: ColumnId): SimpleTask['status'] {
  if (column === 'in-progress') return 'running'
  if (column === 'review') return 'review'
  if (column === 'done') return 'done'
  return 'todo'
}

function columnForStatus(status: SimpleTask['status']): ColumnId {
  if (status === 'running') return 'in-progress'
  if (status === 'review') return 'review'
  if (status === 'done') return 'done'
  return 'planning'
}

function stripMarkdownHeading(content: string, title: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  if (lines[0]?.trim().replace(/^#+\s*/, '') === title.trim()) {
    lines.shift()
  }
  return lines.join('\n').trim()
}

async function taskListFromLegacyBoard(board: BoardState): Promise<TaskListState> {
  const taskList: TaskListState = structuredClone(EMPTY_TASKS)

  for (const column of LEGACY_COLUMNS) {
    for (const id of board.columns[column] ?? []) {
      const task = board.tasks[id]
      if (!task || taskList.tasks[id]) continue

      const markdown = await window.orchestrate.readTaskMarkdown(id).catch(() => '')
      const markdownPrompt = stripMarkdownHeading(markdown, task.title)
      const firstStep = task.steps?.find((step) => step.prompt.trim())
      const prompt = markdownPrompt || firstStep?.prompt.trim() || task.title
      const now = new Date().toISOString()

      taskList.order.push(id)
      taskList.tasks[id] = {
        id,
        prompt,
        mode: 'build',
        status: legacyStatusForColumn(column),
        branchName: task.worktree?.branchName?.trim() || defaultTaskBranch(id),
        agentType: task.agentType || 'claude-code',
        pinned: false,
        schedule: task.schedule,
        createdAt: task.createdAt,
        updatedAt: task.createdAt || now
      }
    }
  }

  return taskList
}

function legacyBoardFromTaskList(taskList: TaskListState): BoardState {
  const board: BoardState = {
    columns: {
      planning: [],
      'in-progress': [],
      review: [],
      done: []
    },
    tasks: {}
  }

  for (const id of taskList.order) {
    const task = taskList.tasks[id]
    if (!task) continue
    const column = columnForStatus(task.status)
    board.columns[column].push(id)
    board.tasks[id] = {
      title:
        task.prompt
          .split('\n')
          .find((line) => line.trim())
          ?.trim() || 'Task',
      createdAt: task.createdAt,
      schedule: task.schedule,
      agentType: task.agentType,
      worktree: {
        enabled: true,
        branchName: task.branchName
      }
    }
  }

  return board
}

async function loadTaskListFromApi(): Promise<TaskListState> {
  if (typeof window.orchestrate.loadTasks === 'function') {
    try {
      return await window.orchestrate.loadTasks()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('No handler registered')) throw err
      console.warn('[Tasks] task:loadTasks handler unavailable; falling back to legacy task board')
    }
  }

  console.warn('[Tasks] loadTasks API unavailable; falling back to legacy task board')
  const board = await window.orchestrate.loadBoard()
  return taskListFromLegacyBoard(board)
}

async function saveTaskListToApi(taskList: TaskListState): Promise<void> {
  if (typeof window.orchestrate.saveTasks === 'function') {
    try {
      await window.orchestrate.saveTasks(taskList)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('No handler registered')) throw err
      console.warn('[Tasks] task:saveTasks handler unavailable; falling back to legacy task board')
    }
  }

  console.warn('[Tasks] saveTasks API unavailable; falling back to legacy task board')
  await window.orchestrate.saveBoard(legacyBoardFromTaskList(taskList))
  await Promise.all(
    taskList.order.map(async (id) => {
      const task = taskList.tasks[id]
      if (!task) return
      await window.orchestrate.writeTaskMarkdown(
        id,
        `# ${task.prompt.split('\n')[0]}\n\n${task.prompt}\n`
      )
    })
  )
}

interface TasksState {
  taskList: TaskListState | null
  isLoading: boolean
  hasLoaded: boolean
  loadError: string | null
  activeAgentTasks: Record<string, { terminalId: string; agent: AgentType }>
  composerOpen: boolean
  composerKind: 'manual' | 'scheduled'
  editingTaskId: string | null

  loadTasks: () => Promise<void>
  resetTasks: () => void
  saveTaskList: (taskList: TaskListState) => Promise<void>
  openComposer: (kind?: 'manual' | 'scheduled', taskId?: string | null) => void
  closeComposer: () => void
  createTask: (input: CreateSimpleTaskInput) => Promise<string | null>
  updateTask: (id: string, updates: UpdateSimpleTaskInput) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  setTaskStatus: (id: string, status: Exclude<TaskStatus, 'running'>) => Promise<void>
  updateTaskRun: (taskId: string, run: SimpleTaskRun, status?: TaskStatus) => Promise<void>
  startTask: (id: string, agentOverride?: AgentType) => Promise<void>
  stopTask: (id: string) => void
  markActiveAgentTask: (taskId: string, terminalId: string, agent: AgentType) => void
  clearActiveAgentTask: (taskId: string) => void
}

export const useTasksStore = create<TasksState>((set, get) => ({
  taskList: null,
  isLoading: false,
  hasLoaded: false,
  loadError: null,
  activeAgentTasks: {},
  composerOpen: false,
  composerKind: 'manual',
  editingTaskId: null,

  loadTasks: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const taskList = await loadTaskListFromApi()
      const loaded = taskList ?? structuredClone(EMPTY_TASKS)
      const { activeAgentTasks } = get()
      let changed = false
      const now = new Date().toISOString()

      for (const id of loaded.order) {
        const task = loaded.tasks[id]
        if (!task) continue
        if (task.status === 'running' && !activeAgentTasks[id]) {
          task.status = 'failed'
          task.updatedAt = now
          if (task.lastRun?.status === 'running') {
            task.lastRun = { ...task.lastRun, status: 'failed', finishedAt: now }
          }
          changed = true
        }
      }

      if (changed) {
        saveTaskListToApi(loaded).catch(() => {})
      }

      set({ taskList: loaded, isLoading: false, hasLoaded: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Tasks] Failed to load tasks:', err)
      toast.error(`Failed to load tasks: ${message}`)
      set({
        taskList: structuredClone(EMPTY_TASKS),
        isLoading: false,
        hasLoaded: true,
        loadError: message
      })
    }
  },

  resetTasks: () => {
    set({
      taskList: null,
      hasLoaded: false,
      loadError: null,
      composerOpen: false,
      editingTaskId: null
    })
  },

  saveTaskList: async (taskList) => {
    set({ taskList })
    await saveTaskListToApi(taskList)
  },

  openComposer: (kind = 'manual', taskId = null) => {
    set({ composerOpen: true, composerKind: kind, editingTaskId: taskId })
  },

  closeComposer: () => {
    set({ composerOpen: false, editingTaskId: null })
  },

  createTask: async (input) => {
    const taskList = get().taskList
    if (!taskList) return null

    const prompt = normalizePrompt(input.prompt)
    if (!prompt) {
      toast.error('Task prompt is required')
      return null
    }

    let id = generateId()
    let attempts = 0
    while (taskList.tasks[id] && attempts < 10) {
      id = generateId()
      attempts++
    }
    if (taskList.tasks[id]) return null

    const now = new Date().toISOString()
    const task: SimpleTask = {
      id,
      prompt,
      mode: input.mode,
      status: 'todo',
      branchName: input.branchName?.trim() || defaultTaskBranch(id),
      agentType: input.agentType,
      pinned: input.pinned === true,
      schedule: input.schedule,
      createdAt: now,
      updatedAt: now
    }

    const next: TaskListState = {
      version: 1,
      order: [...taskList.order, id],
      tasks: {
        ...taskList.tasks,
        [id]: task
      }
    }

    await get().saveTaskList(next)
    set({ composerOpen: false, editingTaskId: null })
    return id
  },

  updateTask: async (id, updates) => {
    const taskList = get().taskList
    const task = taskList?.tasks[id]
    if (!taskList || !task) return

    const nextPrompt = updates.prompt !== undefined ? normalizePrompt(updates.prompt) : task.prompt
    if (!nextPrompt) {
      toast.error('Task prompt is required')
      return
    }

    const nextTask: SimpleTask = {
      ...task,
      ...updates,
      prompt: nextPrompt,
      branchName:
        updates.branchName !== undefined
          ? updates.branchName.trim() || defaultTaskBranch(id)
          : task.branchName,
      updatedAt: new Date().toISOString()
    }

    await get().saveTaskList(cloneTasksWithTask(taskList, nextTask))
    set({ composerOpen: false, editingTaskId: null })
  },

  deleteTask: async (id) => {
    const taskList = get().taskList
    if (!taskList?.tasks[id]) return
    const tasks = { ...taskList.tasks }
    delete tasks[id]
    const next: TaskListState = {
      ...taskList,
      order: taskList.order.filter((taskId) => taskId !== id),
      tasks
    }
    await get().saveTaskList(next)
    await window.orchestrate.deleteTask(id)
  },

  setTaskStatus: async (id, status) => {
    const taskList = get().taskList
    const task = taskList?.tasks[id]
    if (!taskList || !task || task.status === 'running') return
    await get().saveTaskList(
      cloneTasksWithTask(taskList, {
        ...task,
        status,
        updatedAt: new Date().toISOString()
      })
    )
  },

  updateTaskRun: async (taskId, run, status) => {
    const taskList = get().taskList
    const task = taskList?.tasks[taskId]
    if (!taskList || !task) return
    const nextTask: SimpleTask = {
      ...task,
      status: status ?? task.status,
      lastRun: run,
      updatedAt: new Date().toISOString()
    }
    await get().saveTaskList(cloneTasksWithTask(taskList, nextTask))
  },

  startTask: async (id, agentOverride) => {
    if (!SAFE_ID_RE.test(id)) {
      console.error('[Tasks] Refusing to start task with unsafe ID:', id)
      return
    }
    const { executeTask } = await import('./task-execution-engine')
    await executeTask(id, agentOverride)
  },

  stopTask: (id) => {
    import('./task-execution-engine')
      .then(({ abortTask }) => abortTask(id))
      .catch((err) => {
        console.error('[Tasks] Failed to stop task:', err)
      })
  },

  markActiveAgentTask: (taskId, terminalId, agent) => {
    set((state) => ({
      activeAgentTasks: {
        ...state.activeAgentTasks,
        [taskId]: { terminalId, agent }
      }
    }))
  },

  clearActiveAgentTask: (taskId) => {
    set((state) => {
      const activeAgentTasks = { ...state.activeAgentTasks }
      delete activeAgentTasks[taskId]
      return { activeAgentTasks }
    })
  }
}))
