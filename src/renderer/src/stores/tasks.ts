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
import { useAppStore } from './app'
import { beginProjectApiFallback } from './project-api-fallback-lock'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const EMPTY_TASKS: TaskListState = {
  version: 1,
  order: [],
  tasks: {}
}

export function taskExecutionKey(projectFolder: string, taskId: string): string {
  return `${projectFolder}\0${taskId}`
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

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function stripMarkdownHeading(content: unknown, title: unknown): string {
  const text = typeof content === 'string' ? content : ''
  const titleText = trimString(title)
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  if (titleText && lines[0]?.trim().replace(/^#+\s*/, '') === titleText) {
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
      const firstStep = Array.isArray(task.steps)
        ? task.steps.find(
            (step) => typeof step?.prompt === 'string' && step.prompt.trim().length > 0
          )
        : undefined
      const prompt = markdownPrompt || trimString(firstStep?.prompt) || trimString(task.title) || id
      const branchName = trimString(task.worktree?.branchName) || defaultTaskBranch(id)
      const now = new Date().toISOString()

      taskList.order.push(id)
      taskList.tasks[id] = {
        id,
        prompt,
        mode: 'build',
        status: legacyStatusForColumn(column),
        branchName,
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

let projectApiFallbackQueue: Promise<unknown> = Promise.resolve()

function withProjectApiFallback<T>(projectFolder: string, action: () => Promise<T>): Promise<T> {
  const previous = projectApiFallbackQueue.catch(() => undefined)
  const next = previous.then(async () => {
    const releaseFallbackLock = beginProjectApiFallback()
    const restoreFolder = currentProjectFolder()
    await window.orchestrate.setActiveProject(projectFolder)
    try {
      return await action()
    } finally {
      try {
        await window.orchestrate.setActiveProject(restoreFolder)
      } finally {
        releaseFallbackLock()
      }
    }
  })
  projectApiFallbackQueue = next.catch(() => undefined)
  return next
}

async function loadTaskListFromApi(projectFolder?: string | null): Promise<TaskListState> {
  if (projectFolder && typeof window.orchestrate.loadTasksForProject === 'function') {
    try {
      return await window.orchestrate.loadTasksForProject(projectFolder)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('No handler registered')) throw err
      console.warn('[Tasks] task:loadTasksForProject handler unavailable; using scoped fallback')
    }
  }

  if (projectFolder) {
    return withProjectApiFallback(projectFolder, async () => {
      if (typeof window.orchestrate.loadTasks === 'function') {
        try {
          return await window.orchestrate.loadTasks()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (!message.includes('No handler registered')) throw err
          console.warn(
            '[Tasks] task:loadTasks handler unavailable; falling back to legacy task board'
          )
        }
      }

      const board = await window.orchestrate.loadBoard()
      return taskListFromLegacyBoard(board)
    })
  }

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

async function saveTaskListToApi(
  taskList: TaskListState,
  projectFolder?: string | null
): Promise<void> {
  if (projectFolder && typeof window.orchestrate.saveTasksForProject === 'function') {
    try {
      await window.orchestrate.saveTasksForProject(projectFolder, taskList)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('No handler registered')) throw err
      console.warn('[Tasks] task:saveTasksForProject handler unavailable; using scoped fallback')
    }
  }

  if (projectFolder) {
    await withProjectApiFallback(projectFolder, async () => {
      if (typeof window.orchestrate.saveTasks === 'function') {
        try {
          await window.orchestrate.saveTasks(taskList)
          return
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (!message.includes('No handler registered')) throw err
          console.warn(
            '[Tasks] task:saveTasks handler unavailable; falling back to legacy task board'
          )
        }
      }

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
    })
    return
  }

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
  taskListsByProject: Record<string, TaskListState>
  isLoading: boolean
  loadingByProject: Record<string, boolean>
  hasLoaded: boolean
  loadError: string | null
  loadErrorsByProject: Record<string, string | null>
  activeAgentTasks: Record<string, { terminalId: string; agent: AgentType }>
  composerOpen: boolean
  composerKind: 'manual' | 'scheduled'
  editingTaskId: string | null
  composerProjectFolder: string | null

  loadTasks: (projectFolder?: string | null) => Promise<void>
  resetTasks: () => void
  getTaskList: (projectFolder?: string | null) => TaskListState | null
  saveTaskList: (taskList: TaskListState, projectFolder?: string | null) => Promise<void>
  openComposer: (
    kind?: 'manual' | 'scheduled',
    taskId?: string | null,
    projectFolder?: string | null
  ) => void
  closeComposer: () => void
  createTask: (
    input: CreateSimpleTaskInput,
    projectFolder?: string | null
  ) => Promise<string | null>
  updateTask: (
    id: string,
    updates: UpdateSimpleTaskInput,
    projectFolder?: string | null
  ) => Promise<void>
  deleteTask: (id: string, projectFolder?: string | null) => Promise<void>
  setTaskStatus: (
    id: string,
    status: Exclude<TaskStatus, 'running'>,
    projectFolder?: string | null
  ) => Promise<void>
  updateTaskRun: (
    taskId: string,
    run: SimpleTaskRun,
    status?: TaskStatus,
    projectFolder?: string | null
  ) => Promise<void>
  startTask: (
    id: string,
    agentOverride?: AgentType,
    options?: { projectFolder?: string | null; navigateOnStart?: boolean }
  ) => Promise<void>
  stopTask: (id: string, projectFolder?: string | null) => void
  markActiveAgentTask: (
    taskId: string,
    terminalId: string,
    agent: AgentType,
    projectFolder?: string | null
  ) => void
  clearActiveAgentTask: (taskId: string, projectFolder?: string | null) => void
}

function currentProjectFolder(): string | null {
  return useAppStore.getState().currentFolder
}

function resolveProjectFolder(projectFolder?: string | null): string | null {
  return projectFolder ?? currentProjectFolder()
}

function setLoadedTaskList(
  set: (partial: Partial<TasksState> | ((state: TasksState) => Partial<TasksState>)) => void,
  projectFolder: string | null,
  taskList: TaskListState
): void {
  if (!projectFolder) {
    set({ taskList })
    return
  }
  set((state) => ({
    taskListsByProject: { ...state.taskListsByProject, [projectFolder]: taskList },
    ...(currentProjectFolder() === projectFolder ? { taskList } : {})
  }))
}

export const useTasksStore = create<TasksState>((set, get) => ({
  taskList: null,
  taskListsByProject: {},
  isLoading: false,
  loadingByProject: {},
  hasLoaded: false,
  loadError: null,
  loadErrorsByProject: {},
  activeAgentTasks: {},
  composerOpen: false,
  composerKind: 'manual',
  editingTaskId: null,
  composerProjectFolder: null,

  loadTasks: async (projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    if (folder) {
      set((state) => ({
        loadingByProject: { ...state.loadingByProject, [folder]: true },
        loadErrorsByProject: { ...state.loadErrorsByProject, [folder]: null },
        ...(currentProjectFolder() === folder ? { isLoading: true, loadError: null } : {})
      }))
    } else {
      set({ isLoading: true, loadError: null })
    }

    try {
      const taskList = await loadTaskListFromApi(folder)
      const loaded = taskList ?? structuredClone(EMPTY_TASKS)
      const { activeAgentTasks } = get()
      let changed = false
      const now = new Date().toISOString()

      for (const id of loaded.order) {
        const task = loaded.tasks[id]
        if (!task) continue
        const activeKey = folder ? taskExecutionKey(folder, id) : id
        if (task.status === 'running' && !activeAgentTasks[activeKey]) {
          task.status = 'failed'
          task.updatedAt = now
          if (task.lastRun?.status === 'running') {
            task.lastRun = { ...task.lastRun, status: 'failed', finishedAt: now }
          }
          changed = true
        }
      }

      if (changed) {
        saveTaskListToApi(loaded, folder).catch((err) => {
          console.error(
            `[Tasks] Failed to persist consistency fix for task list (${loaded.order.length} tasks: ${loaded.order.join(', ')}):`,
            err
          )
        })
      }

      if (folder) {
        set((state) => ({
          taskListsByProject: { ...state.taskListsByProject, [folder]: loaded },
          loadingByProject: { ...state.loadingByProject, [folder]: false },
          loadErrorsByProject: { ...state.loadErrorsByProject, [folder]: null },
          ...(currentProjectFolder() === folder
            ? { taskList: loaded, isLoading: false, hasLoaded: true, loadError: null }
            : {})
        }))
      } else {
        set({ taskList: loaded, isLoading: false, hasLoaded: true })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Tasks] Failed to load tasks:', err)
      toast.error(`Failed to load tasks: ${message}`)
      if (folder) {
        set((state) => {
          const taskListsByProject = { ...state.taskListsByProject }
          delete taskListsByProject[folder]
          return {
            taskListsByProject,
            loadingByProject: { ...state.loadingByProject, [folder]: false },
            loadErrorsByProject: { ...state.loadErrorsByProject, [folder]: message },
            ...(currentProjectFolder() === folder
              ? { taskList: null, isLoading: false, hasLoaded: false, loadError: message }
              : {})
          }
        })
      } else {
        set({
          taskList: structuredClone(EMPTY_TASKS),
          isLoading: false,
          hasLoaded: true,
          loadError: message
        })
      }
    }
  },

  resetTasks: () => {
    set({
      taskList: null,
      taskListsByProject: {},
      isLoading: false,
      loadingByProject: {},
      hasLoaded: false,
      loadError: null,
      loadErrorsByProject: {},
      activeAgentTasks: {},
      composerOpen: false,
      editingTaskId: null,
      composerProjectFolder: null
    })
  },

  getTaskList: (projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    if (folder) return get().taskListsByProject[folder] ?? null
    return get().taskList
  },

  saveTaskList: async (taskList, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const previousTaskList = folder ? get().taskListsByProject[folder] : get().taskList
    setLoadedTaskList(set, folder, taskList)
    try {
      await saveTaskListToApi(taskList, folder)
    } catch (err) {
      if (previousTaskList) {
        setLoadedTaskList(set, folder, previousTaskList)
      }
      throw err
    }
  },

  openComposer: (kind = 'manual', taskId = null, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    set({
      composerOpen: true,
      composerKind: kind,
      editingTaskId: taskId,
      composerProjectFolder: folder
    })
  },

  closeComposer: () => {
    set({ composerOpen: false, editingTaskId: null, composerProjectFolder: null })
  },

  createTask: async (input, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder ?? get().composerProjectFolder)
    if (folder && !get().taskListsByProject[folder]) {
      await get().loadTasks(folder)
    }
    const taskList = folder ? get().taskListsByProject[folder] : get().taskList
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

    await get().saveTaskList(next, folder)
    set({ composerOpen: false, editingTaskId: null, composerProjectFolder: null })
    return id
  },

  updateTask: async (id, updates, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder ?? get().composerProjectFolder)
    const taskList = folder ? get().taskListsByProject[folder] : get().taskList
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

    await get().saveTaskList(cloneTasksWithTask(taskList, nextTask), folder)
    set({ composerOpen: false, editingTaskId: null, composerProjectFolder: null })
  },

  deleteTask: async (id, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const taskList = folder ? get().taskListsByProject[folder] : get().taskList
    if (!taskList?.tasks[id]) return
    const tasks = { ...taskList.tasks }
    delete tasks[id]
    const next: TaskListState = {
      ...taskList,
      order: taskList.order.filter((taskId) => taskId !== id),
      tasks
    }
    await get().saveTaskList(next, folder)
  },

  setTaskStatus: async (id, status, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const taskList = folder ? get().taskListsByProject[folder] : get().taskList
    const task = taskList?.tasks[id]
    if (!taskList || !task || task.status === 'running') return
    await get().saveTaskList(
      cloneTasksWithTask(taskList, {
        ...task,
        status,
        updatedAt: new Date().toISOString()
      }),
      folder
    )
  },

  updateTaskRun: async (taskId, run, status, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const taskList = folder ? get().taskListsByProject[folder] : get().taskList
    const task = taskList?.tasks[taskId]
    if (!taskList || !task) return
    const nextTask: SimpleTask = {
      ...task,
      status: status ?? task.status,
      lastRun: run,
      updatedAt: new Date().toISOString()
    }
    await get().saveTaskList(cloneTasksWithTask(taskList, nextTask), folder)
  },

  startTask: async (id, agentOverride, options) => {
    if (!SAFE_ID_RE.test(id)) {
      console.error('[Tasks] Refusing to start task with unsafe ID:', id)
      return
    }
    const { executeTask } = await import('./task-execution-engine')
    await executeTask(id, agentOverride, options)
  },

  stopTask: (id, projectFolder = null) => {
    import('./task-execution-engine')
      .then(({ abortTask }) => abortTask(id, resolveProjectFolder(projectFolder)))
      .catch((err) => {
        console.error('[Tasks] Failed to stop task:', err)
      })
  },

  markActiveAgentTask: (taskId, terminalId, agent, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const key = folder ? taskExecutionKey(folder, taskId) : taskId
    set((state) => ({
      activeAgentTasks: {
        ...state.activeAgentTasks,
        [key]: { terminalId, agent }
      }
    }))
  },

  clearActiveAgentTask: (taskId, projectFolder = null) => {
    const folder = resolveProjectFolder(projectFolder)
    const key = folder ? taskExecutionKey(folder, taskId) : taskId
    set((state) => {
      const activeAgentTasks = { ...state.activeAgentTasks }
      delete activeAgentTasks[key]
      return { activeAgentTasks }
    })
  }
}))
