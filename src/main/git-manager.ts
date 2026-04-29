import simpleGit, { type SimpleGit, type DefaultLogFields, type ListLogLine } from 'simple-git'
import type { SavePoint, SavePointDetail, GitStatus, FileDiff, CommitNode, BranchInfo, WorktreeInfo } from '@shared/types'

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
    const dirty = await this.hasUncommittedChanges()
    if (!dirty) return ''
    await this.git.add('-A')
    const result = await this.git.commit(message)
    return result.commit ?? ''
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
      // Get authoritative status via --name-status
      const statusMap = await this.getNameStatusMap(hash)
      const summary = await this.git.diffSummary([`${hash}~1`, hash])
      files = summary.files.map((f) => ({
        path: f.file,
        status: statusMap[f.file] ?? this.inferStatusFallback(f),
        insertions: (f as { insertions: number }).insertions ?? 0,
        deletions: (f as { deletions: number }).deletions ?? 0
      }))
    }

    // Get the commit info via git show
    const raw = await this.git.raw([
      'show', '-s', '--format=%s%n%aI', hash
    ])
    const lines = raw.trim().split('\n')
    const message = lines[0] ?? ''
    const date = lines[1] ?? ''

    return { hash, message, date, files }
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

  async getCommitGraph(limit: number = 100, branch?: string): Promise<CommitNode[]> {
    try {
      const format = ['%H', '%P', '%D', '%s', '%aI', '%aN'].join('%x00')
      const args = ['log', `--format=${format}`, '--topo-order', `--max-count=${limit}`]
      if (branch) {
        args.push(branch)
      } else {
        args.push('--all')
      }
      const raw = await this.git.raw(args)
      if (!raw.trim()) return []

      return raw
        .trim()
        .split('\n')
        .map((line) => {
          const [hash, parentStr, refStr, message, date, author] = line.split('\x00')
          return {
            hash,
            parents: parentStr ? parentStr.split(' ') : [],
            refs: refStr ? refStr.split(', ').filter(Boolean) : [],
            message,
            date,
            author
          }
        })
    } catch (err) {
      console.error('[GitManager] Failed to load commit graph:', err)
      return []
    }
  }

  async getBranches(): Promise<BranchInfo[]> {
    try {
      if (!(await this.isRepo())) return []

      const result = await this.git.branch(['-a', '-v', '--no-abbrev'])
      const branches: BranchInfo[] = []
      for (const [name, info] of Object.entries(result.branches)) {
        const isRemote = name.startsWith('remotes/')
        const displayName = isRemote ? name.replace(/^remotes\//, '') : name
        branches.push({
          name: displayName,
          current: info.current,
          commit: info.commit,
          isRemote
        })
      }
      return branches
    } catch (err) {
      console.error('[GitManager] Failed to load branches:', err)
      return []
    }
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch)
  }

  async createBranch(branch: string): Promise<void> {
    await this.git.checkoutLocalBranch(branch)
  }

  async deleteBranch(branch: string, force?: boolean): Promise<void> {
    await this.git.deleteLocalBranch(branch, force)
  }

  async getRemoteUrl(remote = 'origin'): Promise<string | null> {
    try {
      const url = await this.git.remote(['get-url', remote])
      return url ? url.trim() : null
    } catch {
      return null
    }
  }

  // ── Worktrees ──

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const raw = await this.git.raw(['worktree', 'list', '--porcelain'])
    if (!raw.trim()) return []

    const worktrees: WorktreeInfo[] = []
    const blocks = raw.trim().split('\n\n')

    for (const block of blocks) {
      const lines = block.trim().split('\n')
      let path = ''
      let commit = ''
      let branch = ''
      let isMain = false
      let isDetached = false

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.slice('worktree '.length)
        } else if (line.startsWith('HEAD ')) {
          commit = line.slice('HEAD '.length)
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length).replace('refs/heads/', '')
        } else if (line === 'detached') {
          isDetached = true
          branch = commit.slice(0, 8)
        }
      }

      // The first worktree listed is always the main one
      if (worktrees.length === 0) isMain = true

      if (path) {
        worktrees.push({ path, branch, commit, isMain, isDetached })
      }
    }

    return worktrees
  }

  async addWorktree(worktreePath: string, branch: string, createBranch: boolean): Promise<void> {
    const args = ['worktree', 'add']
    if (createBranch) {
      args.push('-b', branch, worktreePath)
    } else {
      args.push(worktreePath, branch)
    }
    await this.git.raw(args)
  }

  async removeWorktree(worktreePath: string, force?: boolean): Promise<void> {
    const args = ['worktree', 'remove']
    if (force) args.push('--force')
    args.push(worktreePath)
    await this.git.raw(args)
  }

  // ── Branch Diff & Merge ──

  async diffBranches(baseBranch: string, compareBranch: string): Promise<FileDiff[]> {
    const statusRaw = await this.git.raw(['diff', '--name-status', `${baseBranch}...${compareBranch}`])
    const statusMap: Record<string, FileDiff['status']> = {}
    for (const line of statusRaw.trim().split('\n')) {
      if (!line) continue
      const match = line.match(/^([MADR])\d*\t([^\t]+)(?:\t([^\t]+))?$/)
      if (match) {
        const status = match[1].charAt(0) as FileDiff['status']
        // For renames, use the new path (3rd capture) as key to match --numstat output
        const key = match[3] ?? match[2]
        statusMap[key] = status
      }
    }

    const numstatRaw = await this.git.raw(['diff', '--numstat', `${baseBranch}...${compareBranch}`])
    const files: FileDiff[] = []
    for (const line of numstatRaw.trim().split('\n')) {
      if (!line) continue
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/)
      if (match) {
        files.push({
          path: match[3],
          status: statusMap[match[3]] ?? 'M',
          insertions: match[1] === '-' ? 0 : parseInt(match[1], 10),
          deletions: match[2] === '-' ? 0 : parseInt(match[2], 10)
        })
      }
    }
    return files
  }

  async getFileDiffBetweenBranches(
    baseBranch: string,
    compareBranch: string,
    filePath: string
  ): Promise<{ before: string; after: string }> {
    let before = ''
    let after = ''
    try {
      before = await this.git.show([`${baseBranch}:${filePath}`])
    } catch {
      before = ''
    }
    try {
      after = await this.git.show([`${compareBranch}:${filePath}`])
    } catch {
      after = ''
    }
    return { before, after }
  }

  async mergeWorktreeBranch(branch: string): Promise<{ success: boolean; conflicts?: string[] }> {
    try {
      await this.git.merge([branch, '--no-edit'])
      return { success: true }
    } catch (err) {
      // Check if this is a merge conflict
      try {
        const status = await this.git.status()
        if (status.conflicted.length > 0) {
          // Abort the failed merge to leave repo clean
          await this.git.raw(['merge', '--abort'])
          return { success: false, conflicts: status.conflicted }
        }
      } catch {
        // status check failed, try to abort anyway
        try { await this.git.raw(['merge', '--abort']) } catch { /* ignore */ }
      }
      throw err
    }
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

  private async getNameStatusMap(hash: string): Promise<Record<string, FileDiff['status']>> {
    const raw = await this.git.raw(['diff-tree', '-r', '--name-status', `${hash}~1`, hash])
    const map: Record<string, FileDiff['status']> = {}
    for (const line of raw.trim().split('\n')) {
      const match = line.match(/^([MADR])\d*\t(.+)$/)
      if (match) {
        const status = match[1].charAt(0) as FileDiff['status']
        map[match[2]] = status
      }
    }
    return map
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

  /** Fallback heuristic when authoritative name-status is unavailable. */
  private inferStatusFallback(f: { file: string; insertions?: number; deletions?: number }): FileDiff['status'] {
    const ins = (f as { insertions: number }).insertions ?? 0
    const del = (f as { deletions: number }).deletions ?? 0
    if (del === 0 && ins > 0) return 'A'
    if (ins === 0 && del > 0) return 'D'
    return 'M'
  }
}
