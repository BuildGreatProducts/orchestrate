import { useEffect, useRef } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useHistoryStore } from '@renderer/stores/history'
import EmptyState from './EmptyState'
import CreateSavePoint from './CreateSavePoint'
import SavePointList from './SavePointList'
import DiffViewer from './DiffViewer'
import ConfirmDialog from './ConfirmDialog'

export default function HistoryTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const isGitRepo = useHistoryStore((s) => s.isGitRepo)
  const isLoading = useHistoryStore((s) => s.isLoading)
  const hasLoaded = useHistoryStore((s) => s.hasLoaded)
  const checkIsRepo = useHistoryStore((s) => s.checkIsRepo)
  const refreshAll = useHistoryStore((s) => s.refreshAll)
  const resetState = useHistoryStore((s) => s.resetState)

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
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-zinc-500">
        Checking git status...
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
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-zinc-500">
        Loading history...
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <CreateSavePoint />
      <SavePointList />

      {/* Modals */}
      <DiffViewer />

      {confirmRevert !== null && (
        <ConfirmDialog
          title="Revert Save Point"
          description="This will undo the changes from this save point while keeping later changes. A new save point will be created."
          confirmLabel="Revert"
          variant="danger"
          onConfirm={confirmAndRevert}
          onCancel={cancelRevert}
        />
      )}

      {confirmRestore !== null && (
        <ConfirmDialog
          title="Restore to Save Point"
          description="This will reset your project to this save point. All changes after it will be lost."
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
