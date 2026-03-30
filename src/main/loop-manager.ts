import { readFile, writeFile, mkdir, unlink, rename, readdir } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { nanoid } from 'nanoid'
import type { Loop } from '@shared/types'

export const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function validateLoopId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid loop ID: ${String(id)}`)
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

export class LoopManager {
  private loopsDir: string

  constructor(projectFolder: string) {
    this.loopsDir = join(projectFolder, '.orchestrate', 'loops')
  }

  setProjectFolder(folder: string): void {
    this.loopsDir = join(folder, '.orchestrate', 'loops')
  }

  private validateId(id: string): void {
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`Invalid loop ID: ${id}`)
    }
    const target = resolve(this.loopsDir, `${id}.json`)
    const rel = relative(this.loopsDir, target)
    if (rel.startsWith('..') || rel.startsWith(sep)) {
      throw new Error('Loop ID resolves outside loops directory')
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.loopsDir, { recursive: true })
  }

  async listLoops(): Promise<Loop[]> {
    let files: string[]
    try {
      files = await readdir(this.loopsDir)
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return []
      throw err
    }

    const loops: Loop[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.loopsDir, file), 'utf-8')
        const loop: Loop = JSON.parse(raw)
        if (!loop.id || !loop.name) continue
        loops.push(loop)
      } catch {
        // Skip malformed files
      }
    }

    loops.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return loops
  }

  async loadLoop(id: string): Promise<Loop | null> {
    this.validateId(id)
    try {
      const raw = await readFile(join(this.loopsDir, `${id}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return null
      throw err
    }
  }

  async saveLoop(loop: Loop): Promise<void> {
    this.validateId(loop.id)
    await this.ensureDir()
    const tmpPath = join(this.loopsDir, `${loop.id}.json.tmp`)
    const finalPath = join(this.loopsDir, `${loop.id}.json`)
    try {
      await writeFile(tmpPath, JSON.stringify(loop, null, 2), 'utf-8')
      await rename(tmpPath, finalPath)
    } catch (err) {
      await unlink(tmpPath).catch(() => {})
      throw err
    }
  }

  async deleteLoop(id: string): Promise<void> {
    this.validateId(id)
    try {
      await unlink(join(this.loopsDir, `${id}.json`))
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return
      throw err
    }
  }

  generateId(): string {
    return nanoid(8)
  }
}
