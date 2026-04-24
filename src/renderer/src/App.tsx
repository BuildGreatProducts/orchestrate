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
import type { ProjectDetailTabId } from '@shared/types'
import OrchestrateTab from '@renderer/components/orchestrate/OrchestrateTab'
import SkillsSettings from '@renderer/components/settings/SkillsSettings'
import BrowserTab from '@renderer/components/browser/BrowserTab'
import SettingsPage from '@renderer/components/settings/SettingsPage'
import TerminalContentArea from '@renderer/components/agents/TerminalContentArea'
import ProjectDetailPage from '@renderer/components/project/ProjectDetailPage'
import WorktreeDetailPage from '@renderer/components/worktree/WorktreeDetailPage'
import { CommandPalette } from '@renderer/components/shared'

function App(): React.JSX.Element {
  const contentView = useAppStore((s) => s.contentView)
  const loadLastFolder = useAppStore((s) => s.loadLastFolder)
  const loadProjects = useAppStore((s) => s.loadProjects)
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)
  const toggleCommandPalette = useAppStore((s) => s.toggleCommandPalette)

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

      // Cmd/Ctrl+1–4: Switch project detail tabs (when viewing project detail)
      const detailTabs: ProjectDetailTabId[] = ['tasks', 'commands', 'files', 'history']
      if (e.key >= '1' && e.key <= '4') {
        const cv = useAppStore.getState().contentView
        if (cv.type === 'project-detail') {
          e.preventDefault()
          const idx = parseInt(e.key, 10) - 1
          if (detailTabs[idx]) {
            useAppStore.getState().setProjectDetailTab(detailTabs[idx])
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
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <main className="relative mb-2.5 mr-2.5 ml-px mt-px flex-1 overflow-hidden rounded-lg bg-black ring-1 ring-zinc-800">
          {/* Orchestrate — global feed */}
          <div
            className={
              contentView.type === 'orchestrate'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <OrchestrateTab />
          </div>

          {/* Project detail — tabbed Files/Tasks/History */}
          <div
            className={
              contentView.type === 'project-detail'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <ProjectDetailPage />
          </div>

          {/* Worktree detail — branch diff & merge */}
          <div
            className={
              contentView.type === 'worktree-detail'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            {contentView.type === 'worktree-detail' && (
              <WorktreeDetailPage worktreePath={contentView.worktreePath} />
            )}
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

          {/* Settings */}
          <div
            className={
              contentView.type === 'page' && contentView.pageId === 'settings'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <SettingsPage />
          </div>

          {/* Skills */}
          <div
            className={
              contentView.type === 'page' && contentView.pageId === 'skills'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <SkillsSettings />
          </div>

          {/* Browser */}
          <div
            className={
              contentView.type === 'page' && contentView.pageId === 'browser'
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <BrowserTab />
          </div>
        </main>
      </div>
      <CommandPalette open={commandPaletteOpen} onOpenChange={toggleCommandPalette} />
      <ToastContainer />
    </div>
  )
}

export default App
