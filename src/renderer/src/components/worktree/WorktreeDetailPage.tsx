import { useState, useEffect, useCallback, useRef } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { GitBranch, ArrowRight, GitMerge, Loader2 } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useWorktreeStore } from '@renderer/stores/worktree'
import { useTerminalStore } from '@renderer/stores/terminal'
import { toast } from '@renderer/stores/toast'
import FileChangeList from '@renderer/components/history/FileChangeList'
import type { FileDiff, WorktreeInfo } from '@shared/types'

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
  yaml: 'yaml', yml: 'yaml', sh: 'shell', sql: 'sql', xml: 'xml', svg: 'xml',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp'
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

interface WorktreeDetailPageProps {
  worktreePath: string
}

export default function WorktreeDetailPage({ worktreePath }: WorktreeDetailPageProps): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const showProjectDetail = useAppStore((s) => s.showProjectDetail)
  const worktrees = useWorktreeStore((s) => s.worktrees[currentFolder ?? ''] ?? [])
  const loadWorktrees = useWorktreeStore((s) => s.loadWorktrees)

  const [files, setFiles] = useState<FileDiff[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffBefore, setDiffBefore] = useState('')
  const [diffAfter, setDiffAfter] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const diffRequestRef = useRef(0)

  // Find the worktree and main branch info
  const worktree: WorktreeInfo | undefined = worktrees.find((w) => w.path === worktreePath)
  const mainWorktree: WorktreeInfo | undefined = worktrees.find((w) => w.isMain)
  const mainBranch = mainWorktree?.branch ?? 'main'
  const compareBranch = worktree?.branch ?? ''

  // Load changed files
  useEffect(() => {
    if (!currentFolder) return
    let active = true

    // Ensure worktrees are loaded so we can resolve branch names
    if (worktrees.length === 0) {
      loadWorktrees(currentFolder)
      return
    }

    // Once we have branch names, fetch the diff
    if (!compareBranch) return
    setLoading(true)
    setFiles([])
    setSelectedFile(null)

    window.orchestrate.diffWorktreeFiles(currentFolder, mainBranch, compareBranch)
      .then((result) => {
        if (active) {
          setFiles(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setFiles([])
          setLoading(false)
        }
      })

    return () => { active = false }
  }, [currentFolder, mainBranch, compareBranch, worktrees.length, loadWorktrees])

  // Load file diff when selected
  const handleViewDiff = useCallback((filePath: string) => {
    if (!currentFolder) return
    const requestId = ++diffRequestRef.current
    setSelectedFile(filePath)
    setDiffLoading(true)
    window.orchestrate.diffWorktreeFile(currentFolder, mainBranch, compareBranch, filePath)
      .then(({ before, after }) => {
        if (diffRequestRef.current !== requestId) return
        setDiffBefore(before)
        setDiffAfter(after)
        setDiffLoading(false)
      })
      .catch(() => {
        if (diffRequestRef.current !== requestId) return
        setDiffBefore('')
        setDiffAfter('')
        setDiffLoading(false)
      })
  }, [currentFolder, mainBranch, compareBranch])

  // Merge & close
  const handleMerge = async (): Promise<void> => {
    if (!currentFolder || !compareBranch) return
    setMerging(true)
    setMergeError(null)
    try {
      const result = await window.orchestrate.mergeWorktree(currentFolder, compareBranch)
      if (!result.success) {
        setMergeError(`Merge conflicts in:\n${result.conflicts?.join('\n') ?? 'unknown files'}`)
        setMerging(false)
        setConfirmMerge(false)
        return
      }
      // Close all worktree terminals
      const tabs = useTerminalStore.getState().tabs.filter((t) => t.worktreePath === worktreePath)
      for (const tab of tabs) {
        useTerminalStore.getState().closeTab(tab.id)
      }
      // Remove worktree
      try {
        await window.orchestrate.removeWorktree(currentFolder, worktreePath, true)
      } catch {
        // Worktree removal failed but merge succeeded
      }
      await loadWorktrees(currentFolder)
      toast.success(`Merged ${compareBranch} into ${mainBranch}`)
      await showProjectDetail(currentFolder)
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : String(err))
    } finally {
      setMerging(false)
      setConfirmMerge(false)
    }
  }

  // Summary stats
  const totalInsertions = files.reduce((sum, f) => sum + f.insertions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  if (!currentFolder) {
    return <div className="flex h-full items-center justify-center text-zinc-600">No project selected</div>
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <GitBranch size={16} className="text-emerald-500" />
        <span className="text-sm font-semibold text-zinc-200">{compareBranch}</span>
        <ArrowRight size={14} className="text-zinc-600" />
        <span className="text-sm text-zinc-400">{mainBranch}</span>

        {files.length > 0 && (
          <span className="ml-2 text-xs text-zinc-500">
            {files.length} file{files.length !== 1 ? 's' : ''} changed
            {totalInsertions > 0 && <span className="ml-1 text-green-400">+{totalInsertions}</span>}
            {totalDeletions > 0 && <span className="ml-1 text-red-400">-{totalDeletions}</span>}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setConfirmMerge(true)}
          disabled={merging || loading}
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:hover:bg-white"
        >
          <GitMerge size={14} />
          {merging ? 'Merging...' : 'Merge & Close'}
        </button>
      </div>

      {/* Merge confirmation banner */}
      {confirmMerge && (
        <div className="flex items-center justify-between border-b border-zinc-800 bg-emerald-950/30 px-4 py-2">
          <span className="text-sm text-zinc-300">
            Merge <strong className="text-zinc-100">{compareBranch}</strong> into <strong className="text-zinc-100">{mainBranch}</strong>? This will close all agents and remove the worktree.
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {merging && <Loader2 size={12} className="animate-spin" />}
              Confirm
            </button>
            <button
              onClick={() => setConfirmMerge(false)}
              className="rounded bg-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Merge error */}
      {mergeError && (
        <div className="border-b border-zinc-800 bg-red-950/30 px-4 py-2">
          <p className="text-sm font-medium text-red-300">Merge failed</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-red-400">{mergeError}</pre>
          <button
            onClick={() => setMergeError(null)}
            className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: file list */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-zinc-800">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Loading changes...
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">
              No changes between branches
            </div>
          ) : (
            <FileChangeList files={files} onViewDiff={handleViewDiff} />
          )}
        </div>

        {/* Right: diff viewer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="border-b border-zinc-800 px-4 py-2">
                <span className="text-sm text-zinc-300">{selectedFile}</span>
              </div>
              <div className="flex-1">
                {diffLoading ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Loading diff...
                  </div>
                ) : (
                  <DiffEditor
                    original={diffBefore}
                    modified={diffAfter}
                    language={detectLanguage(selectedFile)}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
