import { create } from 'zustand'
import type { BoardState, ColumnId, AgentType, Loop, TaskSchedule } from '@shared/types'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { useHistoryStore } from './history'
import { useLoopsStore } from './loops'
import { useAgentsStore } from './agents'
import { buildAgentCommand } from '../lib/agent-command-builder'
import { toast } from './toast'

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
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

interface TasksState {
  board: BoardState | null
  selectedTaskId: string | null
  renamingTaskId: string | null
  markdownRevision: number
  isLoading: boolean
  hasLoaded: boolean
  loadError: string | null
  activeAgentTasks: Record<string, { terminalId: string; agent: AgentType }>

  loadBoard: () => Promise<void>
  resetBoard: () => void
  createTask: (columnId: ColumnId, title: string) => Promise<void>
  createLoopTask: (columnId: ColumnId, loop: Loop) => Promise<void>
  setRenamingTaskId: (id: string | null) => void
  updateTaskTitle: (id: string, title: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  moveTask: (taskId: string, toColumn: ColumnId, toIndex: number) => Promise<void>
  reorderInColumn: (columnId: ColumnId, oldIdx: number, newIdx: number) => Promise<void>
  selectTask: (id: string | null) => void
  readMarkdown: (id: string) => Promise<string>
  writeMarkdown: (id: string, content: string) => Promise<void>
  sendToAgent: (id: string, agent: AgentType) => Promise<void>
  trackAgentTask: (taskId: string, terminalId: string, agent: AgentType) => void
  updateTaskSchedule: (id: string, schedule: TaskSchedule | undefined, agentType: AgentType | undefined) => Promise<void>
  updateTaskGroup: (id: string, groupName: string | undefined) => Promise<void>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  board: null,
  selectedTaskId: null,
  renamingTaskId: null,
  markdownRevision: 0,
  isLoading: false,
  hasLoaded: false,
  loadError: null,
  activeAgentTasks: {},

  loadBoard: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const board = await window.orchestrate.loadBoard()
      const loaded = board ?? structuredClone(EMPTY_BOARD)

      // Sweep: move in-progress tasks with no active agent back to planning.
      // activeAgentTasks is runtime-only, so after an app restart it's empty
      // and any previously in-progress tasks are stale.
      const { activeAgentTasks } = get()
      const stale = loaded.columns['in-progress'].filter(
        (id) => loaded.tasks[id]?.type === 'task' && !activeAgentTasks[id]
      )
      if (stale.length > 0) {
        const staleSet = new Set(stale)
        loaded.columns['in-progress'] = loaded.columns['in-progress'].filter((id) => !staleSet.has(id))
        loaded.columns.planning = [...stale, ...loaded.columns.planning]
        // Persist the corrected board
        window.orchestrate.saveBoard(loaded).catch(() => {})
      }

      set({ board: loaded, isLoading: false, hasLoaded: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Tasks] Failed to load board:', err)
      toast.error(`Failed to load task board: ${message}`)
      set({
        board: structuredClone(EMPTY_BOARD),
        isLoading: false,
        hasLoaded: true,
        loadError: message
      })
    }
  },

  resetBoard: () => {
    set({ board: null, selectedTaskId: null, hasLoaded: false, loadError: null })
  },

  createTask: async (columnId: ColumnId, title: string) => {
    const { board } = get()
    if (!board) return

    let id = generateId()
    let attempts = 0
    while (board.tasks[id] && attempts < 10) {
      id = generateId()
      attempts++
    }
    if (board.tasks[id]) return

    const newBoard: BoardState = {
      columns: {
        ...board.columns,
        [columnId]: [...board.columns[columnId], id]
      },
      tasks: {
        ...board.tasks,
        [id]: { title, type: 'task', createdAt: new Date().toISOString() }
      }
    }

    set({ board: newBoard, renamingTaskId: id })
    await window.orchestrate.saveBoard(newBoard)
    await window.orchestrate.writeTaskMarkdown(id, `# ${title}\n\n`)
  },

  createLoopTask: async (columnId: ColumnId, loop: Loop) => {
    const { board } = get()
    if (!board) return

    let id = generateId()
    let attempts = 0
    while (board.tasks[id] && attempts < 10) {
      id = generateId()
      attempts++
    }
    if (board.tasks[id]) return

    const newBoard: BoardState = {
      columns: {
        ...board.columns,
        [columnId]: [...board.columns[columnId], id]
      },
      tasks: {
        ...board.tasks,
        [id]: {
          title: loop.name,
          type: 'loop',
          createdAt: new Date().toISOString(),
          loopId: loop.id
        }
      }
    }

    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  setRenamingTaskId: (id: string | null) => {
    set({ renamingTaskId: id })
  },

  updateTaskTitle: async (id: string, title: string) => {
    const { board } = get()
    if (!board || !board.tasks[id]) return

    const newBoard: BoardState = {
      ...board,
      tasks: {
        ...board.tasks,
        [id]: { ...board.tasks[id], title }
      }
    }

    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  deleteTask: async (id: string) => {
    const { board, selectedTaskId } = get()
    if (!board) return

    const taskMeta = board.tasks[id]
    const newColumns = { ...board.columns }
    for (const col of Object.keys(newColumns) as ColumnId[]) {
      newColumns[col] = newColumns[col].filter((taskId) => taskId !== id)
    }

    const newTasks = { ...board.tasks }
    delete newTasks[id]

    const newBoard: BoardState = { columns: newColumns, tasks: newTasks }
    set({
      board: newBoard,
      selectedTaskId: selectedTaskId === id ? null : selectedTaskId
    })

    await window.orchestrate.saveBoard(newBoard)
    if (!taskMeta || taskMeta.type === 'task') {
      await window.orchestrate.deleteTask(id)
    }
    // For loop tasks, also delete the loop
    if (taskMeta?.type === 'loop' && taskMeta.loopId) {
      try {
        await useLoopsStore.getState().deleteLoop(taskMeta.loopId)
      } catch (err) {
        console.error('[Tasks] Failed to delete associated loop:', err)
      }
    }
  },

  moveTask: async (taskId: string, toColumn: ColumnId, toIndex: number) => {
    const { board } = get()
    if (!board) return

    const newColumns = { ...board.columns }

    // Remove from current column
    let found = false
    for (const col of Object.keys(newColumns) as ColumnId[]) {
      const idx = newColumns[col].indexOf(taskId)
      if (idx !== -1) {
        newColumns[col] = [...newColumns[col]]
        newColumns[col].splice(idx, 1)
        found = true
        break
      }
    }
    if (!found) return

    // Insert into target column with clamped index
    newColumns[toColumn] = [...newColumns[toColumn]]
    const clampedIndex = Math.max(0, Math.min(toIndex, newColumns[toColumn].length))
    newColumns[toColumn].splice(clampedIndex, 0, taskId)

    const newBoard: BoardState = { ...board, columns: newColumns }
    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  reorderInColumn: async (columnId: ColumnId, oldIdx: number, newIdx: number) => {
    const { board } = get()
    if (!board) return

    const items = [...board.columns[columnId]]
    if (oldIdx < 0 || oldIdx >= items.length) return
    const clampedNewIdx = Math.max(0, Math.min(newIdx, items.length - 1))

    const [removed] = items.splice(oldIdx, 1)
    if (removed === undefined) return
    items.splice(clampedNewIdx, 0, removed)

    const newBoard: BoardState = {
      ...board,
      columns: { ...board.columns, [columnId]: items }
    }
    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  selectTask: (id: string | null) => {
    set({ selectedTaskId: id })
  },

  readMarkdown: async (id: string) => {
    return window.orchestrate.readTaskMarkdown(id)
  },

  writeMarkdown: async (id: string, content: string) => {
    await window.orchestrate.writeTaskMarkdown(id, content)
    set({ markdownRevision: get().markdownRevision + 1 })
  },

  sendToAgent: async (id: string, agent: AgentType) => {
    const { board, moveTask, activeAgentTasks } = get()
    if (!board || !board.tasks[id]) return

    if (!SAFE_ID_RE.test(id)) {
      console.error('[Tasks] Refusing to send task with unsafe ID:', id)
      return
    }

    // Prevent duplicate sends
    if (activeAgentTasks[id]) {
      toast.error('Agent already running for this task')
      return
    }

    // Validate agent and folder before any side effects
    const folder = useAppStore.getState().currentFolder
    if (!folder) {
      toast.error('No project folder selected')
      return
    }

    const agentConfig = useAgentsStore.getState().getAgent(agent)
    if (!agentConfig) {
      toast.error(`Unknown agent: ${agent}`)
      return
    }

    // Notify main process (triggers auto-save if git repo)
    await window.orchestrate.sendToAgent(id, agent)

    // Refresh history after auto-save
    const { refreshAll, isGitRepo } = useHistoryStore.getState()
    if (isGitRepo) refreshAll()

    // Find current column and move to in-progress
    let currentColumn: ColumnId | null = null
    for (const col of Object.keys(board.columns) as ColumnId[]) {
      if (board.columns[col].includes(id)) {
        currentColumn = col
        break
      }
    }
    if (currentColumn && currentColumn !== 'in-progress') {
      await moveTask(id, 'in-progress', 0)
    }

    const taskTitle = board.tasks[id].title
    const systemPrompt = `You have orchestrate MCP tools. Your task ID is '${id}'. When you finish, call move_task to move it to 'review'. Use create_save_point to commit.`
    const mcpConfigPath = await window.orchestrate.getMcpConfigPath().catch(() => null)
    const codexMcpFlags = await window.orchestrate.getCodexMcpFlags().catch(() => null)

    const cmd = buildAgentCommand({
      agent: agentConfig,
      prompt: '',
      systemPrompt,
      taskFile: `tasks/task-${id}.md`,
      mcpConfigPath,
      codexMcpFlags
    })

    const tabName = `${agentConfig.displayName}: ${taskTitle}`
    const groupName = board.tasks[id].groupName

    // Create terminal tab, optionally in a group
    const termStore = useTerminalStore.getState()
    let tabId: string
    try {
      if (groupName) {
        const groupId = termStore.findOrCreateGroup(groupName, folder)
        tabId = await termStore.createTabInGroup(folder, groupId, tabName, cmd)
      } else {
        tabId = await termStore.createTab(folder, tabName, cmd)
      }
    } catch (err) {
      // Terminal creation failed — move back to planning and notify user
      toast.error(`Failed to start agent: ${err instanceof Error ? err.message : String(err)}`)
      await get().moveTask(id, 'planning', 0)
      return
    }
    get().trackAgentTask(id, tabId, agent)

    // Switch to terminal view
    useAppStore.getState().showTerminal()
  },

  trackAgentTask: (taskId: string, terminalId: string, agent: AgentType) => {
    set((state) => ({
      activeAgentTasks: {
        ...state.activeAgentTasks,
        [taskId]: { terminalId, agent }
      }
    }))

    let resolved = false
    const cleanup = (): void => {
      if (resolved) return
      resolved = true
      unsub()
      // Remove from active tasks
      set((state) => {
        const { [taskId]: _, ...rest } = state.activeAgentTasks
        return { activeAgentTasks: rest }
      })
    }

    const checkAutoMove = (exitCode: number): void => {
      const { board, moveTask } = get()
      if (!board || !board.columns['in-progress'].includes(taskId)) return
      const target = exitCode === 0 ? 'review' : 'planning'
      moveTask(taskId, target as ColumnId, 0).catch((err) => {
        console.error(`[Tasks] Failed to auto-move task ${taskId} to ${target}:`, err)
      })
    }

    const unsub = useTerminalStore.subscribe((state) => {
      const tab = state.tabs.find((t) => t.id === terminalId)
      if (tab?.exited) {
        checkAutoMove(tab.exitCode ?? 1)
        cleanup()
      }
    })

    // Race guard: check if already exited immediately after subscribing
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === terminalId)
    if (tab?.exited) {
      checkAutoMove(tab.exitCode ?? 1)
      cleanup()
    }
  },

  updateTaskSchedule: async (id: string, schedule: TaskSchedule | undefined, agentType: AgentType | undefined) => {
    const { board } = get()
    if (!board || !board.tasks[id]) return

    const newBoard: BoardState = {
      ...board,
      tasks: {
        ...board.tasks,
        [id]: { ...board.tasks[id], schedule, agentType }
      }
    }

    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  updateTaskGroup: async (id: string, groupName: string | undefined) => {
    const { board } = get()
    if (!board || !board.tasks[id]) return

    const newBoard: BoardState = {
      ...board,
      tasks: {
        ...board.tasks,
        [id]: { ...board.tasks[id], groupName }
      }
    }

    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  }
}))
