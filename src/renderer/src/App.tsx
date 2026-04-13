import { useEffect } from 'react'
import TopBar from '@renderer/components/layout/TopBar'
import LeftSidebar from '@renderer/components/layout/LeftSidebar'
import ToastContainer from '@renderer/components/ui/ToastContainer'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useTasksStore } from '@renderer/stores/tasks'
import { ensureGlobalIpcListeners } from '@renderer/stores/ipc-listeners'
import { useAgentsStore } from '@renderer/stores/agents'
import { NAV_PAGES } from '@shared/types'
import type { NavPageId } from '@shared/types'
import OrchestrateTab from '@renderer/components/orchestrate/OrchestrateTab'
import TasksTab from '@renderer/components/tasks/TasksTab'
import FilesTab from '@renderer/components/files/FilesTab'
import SkillsSettings from '@renderer/components/settings/SkillsSettings'
import HistoryTab from '@renderer/components/history/HistoryTab'
import BrowserTab from '@renderer/components/browser/BrowserTab'
import SettingsPage from '@renderer/components/settings/SettingsPage'
import TerminalContentArea from '@renderer/components/agents/TerminalContentArea'

const PAGE_COMPONENTS: Partial<Record<NavPageId, React.ComponentType>> = {
  tasks: TasksTab,
  files: FilesTab,
  skills: SkillsSettings,
  history: HistoryTab,
  browser: BrowserTab
}

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

      // Cmd/Ctrl+1–5: Switch pages
      const pages: NavPageId[] = ['tasks', 'files', 'skills', 'history', 'browser']
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const idx = parseInt(e.key, 10) - 1
        if (pages[idx]) {
          useAppStore.getState().showPage(pages[idx])
        }
        return
      }

      // Cmd/Ctrl+S: Save file (Files page) or create save point input focus (History page)
      if (e.key === 's') {
        e.preventDefault()
        const cv = useAppStore.getState().contentView
        if (cv.type === 'page' && cv.pageId === 'files') {
          useFilesStore
            .getState()
            .saveActiveFile()
            .catch((err) => {
              console.error('[Shortcut] Failed to save file:', err)
            })
        } else if (cv.type === 'page' && cv.pageId === 'history') {
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
            .createTab(folder)
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
        useAppStore.getState().showPage('tasks')
        useTasksStore
          .getState()
          .createTask('planning', 'New task')
          .catch((err) => {
            console.error('[Shortcut] Failed to create task:', err)
          })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isOrchestrate = contentView.type === 'page' && contentView.pageId === 'orchestrate'

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Orchestrate page — full-width, no sidebar; conditionally mounted */}
        {isOrchestrate && (
          <div className="flex h-full w-full animate-in fade-in duration-150">
            <OrchestrateTab />
          </div>
        )}

        {/* Project UI — sidebar + main content (hidden when on Orchestrate) */}
        <div className={isOrchestrate ? 'hidden' : 'flex flex-1 overflow-hidden'}>
          <LeftSidebar />
          <main className="relative flex-1 overflow-hidden">
            {/* Page views */}
            {NAV_PAGES.map(({ id }) => {
              const Component = PAGE_COMPONENTS[id]
              if (!Component) return null
              const isActive = contentView.type === 'page' && contentView.pageId === id
              return (
                <div
                  key={id}
                  className={
                    isActive ? 'flex h-full w-full animate-in fade-in duration-150' : 'hidden'
                  }
                >
                  <Component />
                </div>
              )
            })}
            {/* Settings page (not in NAV_PAGES, accessed via cog icon) */}
            <div
              className={
                contentView.type === 'page' && contentView.pageId === 'settings'
                  ? 'flex h-full w-full animate-in fade-in duration-150'
                  : 'hidden'
              }
            >
              <SettingsPage />
            </div>
            {/* Terminal view */}
            <div
              className={
                contentView.type === 'terminal'
                  ? 'flex h-full w-full animate-in fade-in duration-150'
                  : 'hidden'
              }
            >
              <TerminalContentArea />
            </div>
          </main>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}

export default App
