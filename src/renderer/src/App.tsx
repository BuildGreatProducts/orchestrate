import { useEffect } from 'react'
import TopBar from '@renderer/components/layout/TopBar'
import WorkspaceShell from '@renderer/components/layout/WorkspaceShell'
import ToastContainer from '@renderer/components/ui/ToastContainer'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useTasksStore } from '@renderer/stores/tasks'
import { ensureGlobalIpcListeners } from '@renderer/stores/ipc-listeners'
import { useAgentsStore } from '@renderer/stores/agents'
import OrchestrateTab from '@renderer/components/orchestrate/OrchestrateTab'
import SettingsPage from '@renderer/components/settings/SettingsPage'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'
import { PROJECT_DETAIL_TAB_IDS } from '@renderer/lib/project-detail-tabs'

function App(): React.JSX.Element {
  const contentView = useAppStore((s) => s.contentView)
  const loadLastFolder = useAppStore((s) => s.loadLastFolder)
  const loadProjects = useAppStore((s) => s.loadProjects)

  useEffect(() => {
    loadLastFolder()
    loadProjects()
    ensureGlobalIpcListeners()
    useAgentsStore.getState().loadAgents()
  }, [loadLastFolder, loadProjects])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd/Ctrl+1–6: Switch project detail tabs (when viewing project detail)
      if (e.key >= '1' && e.key <= '6') {
        const cv = useAppStore.getState().contentView
        if (cv.type === 'project-detail') {
          e.preventDefault()
          const idx = parseInt(e.key, 10) - 1
          if (PROJECT_DETAIL_TAB_IDS[idx]) {
            useAppStore.getState().setProjectDetailTab(PROJECT_DETAIL_TAB_IDS[idx])
          }
        }
        return
      }

      // Cmd/Ctrl+S: Save file (Files tab) or create save point input focus (History tab)
      if (e.key === 's') {
        e.preventDefault()
        const cv = useAppStore.getState().contentView
        const tab = useAppStore.getState().projectDetailTab
        if (cv.type === 'project-detail' && tab === 'files') {
          useFilesStore
            .getState()
            .saveActiveFile()
            .catch((err) => {
              console.error('[Shortcut] Failed to save file:', err)
            })
        } else if (cv.type === 'project-detail' && tab === 'history') {
          const input = document.querySelector<HTMLInputElement>('[data-save-point-input]')
          input?.focus()
        }
        return
      }

      // Cmd/Ctrl+T: New terminal
      if (e.key === 't') {
        e.preventDefault()
        const folder = useAppStore.getState().currentFolder
        if (folder) {
          useTerminalStore
            .getState()
            .createTab({ cwd: folder, kind: 'terminal' })
            .then(() => {
              useAppStore.getState().showTerminal()
            })
            .catch((err) => {
              console.error('[Shortcut] Failed to create terminal:', err)
            })
        }
        return
      }

      // Cmd/Ctrl+N: New task
      if (e.key === 'n') {
        e.preventDefault()
        const folder = useAppStore.getState().currentFolder
        if (folder) {
          useAppStore
            .getState()
            .showProjectDetail(folder, 'tasks')
            .then(() => useTasksStore.getState().createTask('planning', 'New task'))
            .catch((err) => {
              console.error('[Shortcut] Failed to create task:', err)
            })
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-white">
      <TopBar />
      <div className="min-h-0 flex-1 overflow-hidden p-3 pt-0">
        <div className="relative h-full overflow-hidden">
          <div
            className={
              contentView.type === 'orchestrate'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <OrchestrateTab />
          </div>

          <div
            className={
              contentView.type === 'project-detail' || contentView.type === 'worktree-detail'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <WorkspaceShell />
          </div>

          <div
            className={
              contentView.type === 'page' && contentView.pageId === 'settings'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <SettingsPage />
          </div>
        </div>
      </div>
      <ToastContainer />
      <CloseTerminalDialog />
    </div>
  )
}

function CloseTerminalDialog(): React.JSX.Element | null {
  const pendingCloseTabId = useTerminalStore((s) => s.pendingCloseTabId)
  const confirmCloseTab = useTerminalStore((s) => s.confirmCloseTab)
  const cancelCloseTab = useTerminalStore((s) => s.cancelCloseTab)

  if (pendingCloseTabId === null) return null

  return (
    <ConfirmDialog
      title="Close Terminal"
      description="This will terminate the running terminal process. Are you sure you want to close it?"
      confirmLabel="Close"
      variant="danger"
      onConfirm={confirmCloseTab}
      onCancel={cancelCloseTab}
    />
  )
}

export default App
