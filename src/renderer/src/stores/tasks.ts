import { create } from 'zustand'
import type { BoardState, ColumnId, AgentType } from '@shared/types'
import { useTerminalStore } from './terminal'
import { useAppStore } from './app'

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

  loadBoard: async () => {
    set({ isLoading: true })
    try {
      const board = await window.orchestrate.loadBoard()
      set({ board: board ?? structuredClone(EMPTY_BOARD), isLoading: false, hasLoaded: true })
    } catch (err) {
      console.error('[Tasks] Failed to load board:', err)
      set({ board: structuredClone(EMPTY_BOARD), isLoading: false, hasLoaded: true })
    }
  },

  resetBoard: () => {
    set({ board: null, selectedTaskId: null, hasLoaded: false })
  },

  createTask: async (columnId: ColumnId, title: string) => {
    const { board } = get()
    if (!board) return

    const id = generateId()
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
    for (const col of Object.keys(newColumns) as ColumnId[]) {
      const idx = newColumns[col].indexOf(taskId)
      if (idx !== -1) {
        newColumns[col] = [...newColumns[col]]
        newColumns[col].splice(idx, 1)
        break
      }
    }

    // Insert into target column
    newColumns[toColumn] = [...newColumns[toColumn]]
    newColumns[toColumn].splice(toIndex, 0, taskId)

    const newBoard: BoardState = { ...board, columns: newColumns }
    set({ board: newBoard })
    await window.orchestrate.saveBoard(newBoard)
  },

  reorderInColumn: async (columnId: ColumnId, oldIdx: number, newIdx: number) => {
    const { board } = get()
    if (!board) return

    const items = [...board.columns[columnId]]
    const [removed] = items.splice(oldIdx, 1)
    items.splice(newIdx, 0, removed)

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

    // Notify main process (Phase 5.11 hook)
    await window.orchestrate.sendToAgent(id, agent)

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
