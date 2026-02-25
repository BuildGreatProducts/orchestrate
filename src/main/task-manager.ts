import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { nanoid } from 'nanoid'
import type { BoardState } from '@shared/types'

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

export class TaskManager {
  private tasksDir: string

  constructor(projectFolder: string) {
    this.tasksDir = join(projectFolder, 'tasks')
  }

  setProjectFolder(folder: string): void {
    this.tasksDir = join(folder, 'tasks')
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true })
  }

  async loadBoard(): Promise<BoardState> {
    await this.ensureDir()
    try {
      const raw = await readFile(join(this.tasksDir, 'board.json'), 'utf-8')
      return JSON.parse(raw) as BoardState
    } catch {
      return structuredClone(EMPTY_BOARD)
    }
  }

  async saveBoard(board: BoardState): Promise<void> {
    await this.ensureDir()
    await writeFile(join(this.tasksDir, 'board.json'), JSON.stringify(board, null, 2), 'utf-8')
  }

  async readMarkdown(id: string): Promise<string> {
    try {
      return await readFile(join(this.tasksDir, `task-${id}.md`), 'utf-8')
    } catch {
      return ''
    }
  }

  async writeMarkdown(id: string, content: string): Promise<void> {
    await this.ensureDir()
    await writeFile(join(this.tasksDir, `task-${id}.md`), content, 'utf-8')
  }

  async deleteMarkdown(id: string): Promise<void> {
    try {
      await unlink(join(this.tasksDir, `task-${id}.md`))
    } catch {
      // Ignore if file doesn't exist
    }
  }

  generateId(): string {
    return nanoid(8)
  }
}
