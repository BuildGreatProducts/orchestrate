import { useEffect, useRef } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useHistoryStore } from '@renderer/stores/history'
import type { ViewMode } from '@renderer/stores/history'
import Spinner from '@renderer/components/ui/Spinner'
import EmptyState from './EmptyState'
import CreateSavePoint from './CreateSavePoint'
import SavePointList from './SavePointList'
import DiffViewer from './DiffViewer'
import ConfirmDialog from './ConfirmDialog'
import BranchGraphView from './BranchGraphView'

function ViewModeToggle({
  mode,
  onChange
}: {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}): React.JSX.Element {
  return (
    <div className="flex gap-0.5 rounded-md bg-zinc-800/50 p-0.5">
      <button
        onClick={() => onChange('savepoints')}
        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
          mode === 'savepoints'
            ? 'bg-zinc-700 text-zinc-200'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        Save Points
      </button>
      <button
        onClick={() => onChange('graph')}
        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
          mode === 'graph'
            ? 'bg-zinc-700 text-zinc-200'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        Branches
      </button>
    </div>
  )
}

export default function HistoryTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const isGitRepo = useHistoryStore((s) => s.isGitRepo)
  const isLoading = useHistoryStore((s) => s.isLoading)
  const hasLoaded = useHistoryStore((s) => s.hasLoaded)
  const checkIsRepo = useHistoryStore((s) => s.checkIsRepo)
  const refreshAll = useHistoryStore((s) => s.refreshAll)
  const resetState = useHistoryStore((s) => s.resetState)

  const viewMode = useHistoryStore((s) => s.viewMode)
  const setViewMode = useHistoryStore((s) => s.setViewMode)

  const confirmRevert = useHistoryStore((s) => s.confirmRevert)
  const confirmAndRevert = useHistoryStore((s) => s.confirmAndRevert)
  const cancelRevert = useHistoryStore((s) => s.cancelRevert)

  const confirmRestore = useHistoryStore((s) => s.confirmRestore)
  const confirmAndRestore = useHistoryStore((s) => s.confirmAndRestore)
  const cancelRestore = useHistoryStore((s) => s.cancelRestore)

  const showUncommittedDialog = useHistoryStore((s) => s.showUncommittedDialog)
  const dismissUncommittedDialog = useHistoryStore((s) => s.dismissUncommittedDialog)

  const prevFolderRef = useRef(currentFolder)

  useEffect(() => {
    if (currentFolder !== prevFolderRef.current) {
      prevFolderRef.current = currentFolder
      resetState()
    }

    if (!currentFolder) return

    const init = async (): Promise<void> => {
      await checkIsRepo()
      const repo = useHistoryStore.getState().isGitRepo
      if (repo) {
        await refreshAll()
      }
    }
    init()
  }, [currentFolder, checkIsRepo, refreshAll, resetState])

  // No folder selected
  if (!currentFolder) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-zinc-500">
        Select a folder to view history
      </div>
    )
  }

  // Still checking
  if (isGitRepo === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-sm text-zinc-500">
        <Spinner className="text-zinc-500" />
        <span>Checking git status...</span>
      </div>
    )
  }

  // Not a git repo
  if (!isGitRepo) {
    return <EmptyState />
  }

  // Loading initial data
  if (isLoading && !hasLoaded) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-sm text-zinc-500">
        <Spinner className="text-zinc-500" />
        <span>Loading history...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* View mode toggle header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Content area */}
      {viewMode === 'savepoints' ? (
        <>
          <CreateSavePoint />
          <SavePointList />
        </>
      ) : (
        <BranchGraphView />
      )}

      {/* Modals (shared across both views) */}
      <DiffViewer />

      {confirmRevert !== null && (
        <ConfirmDialog
          title="Revert Commit"
          description="This will undo the changes from this commit while keeping later changes. A new commit will be created."
          confirmLabel="Revert"
          variant="danger"
          onConfirm={confirmAndRevert}
          onCancel={cancelRevert}
        />
      )}

      {confirmRestore !== null && (
        <ConfirmDialog
          title="Restore to Commit"
          description="This will reset your project to this commit. All changes after it will be lost."
          confirmLabel="Restore"
          variant="danger"
          onConfirm={confirmAndRestore}
          onCancel={cancelRestore}
        />
      )}

      {showUncommittedDialog && (
        <ConfirmDialog
          title="Unsaved Changes"
          description="You have unsaved changes. Create a save point first before restoring."
          confirmLabel="OK"
          variant="primary"
          onConfirm={dismissUncommittedDialog}
          onCancel={dismissUncommittedDialog}
        />
      )}
    </div>
  )
}
