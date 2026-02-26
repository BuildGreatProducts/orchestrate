import simpleGit, { type SimpleGit, type DefaultLogFields, type ListLogLine } from 'simple-git'
import type { SavePoint, SavePointDetail, GitStatus, FileDiff } from '@shared/types'

export class GitManager {
  private git: SimpleGit

  constructor(cwd: string) {
    this.git = simpleGit(cwd)
  }

  setCwd(cwd: string): void {
    this.git = simpleGit(cwd)
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.raw(['rev-parse', '--is-inside-work-tree'])
      return true
    } catch {
      return false
    }
  }

  async init(): Promise<void> {
    await this.git.init()
    await this.git.add('-A')
    await this.git.commit('Initial save point', { '--allow-empty': null })
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status()
    return {
      modified: status.modified,
      added: status.created,
      deleted: status.deleted,
      untracked: status.not_added
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status()
    return !status.isClean()
  }

  async createSavePoint(message: string): Promise<string> {
    await this.git.add('-A')
    const result = await this.git.commit(message)
    return result.commit
  }

  async autoSaveBeforeAgent(taskTitle: string): Promise<boolean> {
    const dirty = await this.hasUncommittedChanges()
    if (!dirty) return false
    await this.createSavePoint(`[auto] Before sending: ${taskTitle}`)
    return true
  }

  async getHistory(limit: number = 50): Promise<SavePoint[]> {
    try {
      const log = await this.git.log(['--stat', `--max-count=${limit}`])

      return log.all.map((entry: DefaultLogFields & ListLogLine) => {
        const diff = entry.diff
        return {
          hash: entry.hash,
          message: entry.message,
          date: entry.date,
          filesChanged: diff?.changed ?? 0,
          insertions: diff?.insertions ?? 0,
          deletions: diff?.deletions ?? 0,
          isAutoSave: entry.message.startsWith('[auto] ')
        }
      })
    } catch {
      return []
    }
  }

  async getSavePointDetail(hash: string): Promise<SavePointDetail> {
    const isFirst = await this.isFirstCommit(hash)

    let files: FileDiff[]

    if (isFirst) {
      // First commit: use diff-tree --root
      const raw = await this.git.raw(['diff-tree', '--root', '-r', '--numstat', hash])
      files = this.parseNumstatRoot(raw)
    } else {
      const summary = await this.git.diffSummary([`${hash}~1`, hash])
      files = summary.files.map((f) => ({
        path: f.file,
        status: this.inferStatus(f),
        insertions: (f as { insertions: number }).insertions ?? 0,
        deletions: (f as { deletions: number }).deletions ?? 0
      }))
    }

    // Get the commit info
    const log = await this.git.log([`--max-count=1`, hash])
    const entry = log.latest as (DefaultLogFields & ListLogLine) | null

    return {
      hash,
      message: entry?.message ?? '',
      date: entry?.date ?? '',
      files
    }
  }

  async getFileDiff(hash: string, filePath: string): Promise<{ before: string; after: string }> {
    const isFirst = await this.isFirstCommit(hash)

    let before = ''
    let after = ''

    if (isFirst) {
      before = ''
    } else {
      try {
        before = await this.git.show([`${hash}~1:${filePath}`])
      } catch {
        before = '' // File didn't exist before (new file)
      }
    }

    try {
      after = await this.git.show([`${hash}:${filePath}`])
    } catch {
      after = '' // File was deleted
    }

    return { before, after }
  }

  async revert(hash: string): Promise<void> {
    try {
      await this.git.revert(hash, { '--no-edit': null })
    } catch {
      try {
        await this.git.raw(['revert', '--abort'])
      } catch {
        // Abort may fail if revert didn't start — that's ok
      }
      throw new Error('REVERT_CONFLICT')
    }
  }

  async restore(hash: string): Promise<void> {
    const dirty = await this.hasUncommittedChanges()
    if (dirty) {
      throw new Error('UNCOMMITTED_CHANGES')
    }
    await this.git.reset(['--hard', hash])
  }

  // ── Helpers ──

  private async isFirstCommit(hash: string): Promise<boolean> {
    try {
      await this.git.raw(['rev-parse', `${hash}~1`])
      return false
    } catch {
      return true
    }
  }

  private parseNumstatRoot(raw: string): FileDiff[] {
    const files: FileDiff[] = []
    for (const line of raw.split('\n')) {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/)
      if (match) {
        files.push({
          path: match[3],
          status: 'A',
          insertions: match[1] === '-' ? 0 : parseInt(match[1], 10),
          deletions: match[2] === '-' ? 0 : parseInt(match[2], 10)
        })
      }
    }
    return files
  }

  private inferStatus(f: { file: string; insertions?: number; deletions?: number }): FileDiff['status'] {
    const ins = (f as { insertions: number }).insertions ?? 0
    const del = (f as { deletions: number }).deletions ?? 0
    if (del === 0 && ins > 0) return 'A'
    if (ins === 0 && del > 0) return 'D'
    return 'M'
  }
}
