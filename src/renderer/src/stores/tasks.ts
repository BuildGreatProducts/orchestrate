import { create } from 'zustand'
import type { BoardState, ColumnId, AgentType } from '@shared/types'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'
import { useHistoryStore } from './history'

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
    draft: [],
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
  isLoading: boolean
  hasLoaded: boolean
  loadError: string | null

  loadBoard: () => Promise<void>
  resetBoard: () => void
  createTask: (columnId: ColumnId, title: string) => Promise<void>
  updateTaskTitle: (id: string, title: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  moveTask: (taskId: string, toColumn: ColumnId, toIndex: number) => Promise<void>
  reorderInColumn: (columnId: ColumnId, oldIdx: number, newIdx: number) => Promise<void>
  selectTask: (id: string | null) => void
  readMarkdown: (id: string) => Promise<string>
  writeMarkdown: (id: string, content: string) => Promise<void>
  sendToAgent: (id: string, agent: AgentType) => Promise<void>
}

export const useTasksStore = create<TasksState>((set, get) => ({
  board: null,
  selectedTaskId: null,
  isLoading: false,
  hasLoaded: false,
  loadError: null,

  loadBoard: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const board = await window.orchestrate.loadBoard()
      set({ board: board ?? structuredClone(EMPTY_BOARD), isLoading: false, hasLoaded: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Tasks] Failed to load board:', err)
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
        [id]: { title, createdAt: new Date().toISOString() }
      }
    }

    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
    await window.orchestrate.writeTaskMarkdown(id, `# ${title}\n\n`)
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
    await window.orchestrate.deleteTask(id)
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
  },

  sendToAgent: async (id: string, agent: AgentType) => {
    const { board, moveTask } = get()
    if (!board || !board.tasks[id]) return

    if (!SAFE_ID_RE.test(id)) {
      console.error('[Tasks] Refusing to send task with unsafe ID:', id)
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

    // Build the agent command
    const folder = useAppStore.getState().currentFolder
    if (!folder) return

    const taskTitle = board.tasks[id].title
    const cmd =
      agent === 'claude-code'
        ? `claude -p "$(cat tasks/task-${id}.md)"`
        : `codex -q "$(cat tasks/task-${id}.md)"`

    const tabName = `${agent === 'claude-code' ? 'Claude' : 'Codex'}: ${taskTitle}`

    // Create terminal tab on the Agents tab
    await useTerminalStore.getState().createTab(folder, tabName, cmd)

    // Switch to Agents tab
    useAppStore.getState().setActiveTab('agents')
  }
}))
