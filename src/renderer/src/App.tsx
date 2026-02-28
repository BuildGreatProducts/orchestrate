import { useEffect } from 'react'
import TopNav from '@renderer/components/layout/TopNav'
import ToastContainer from '@renderer/components/ui/ToastContainer'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useTasksStore } from '@renderer/stores/tasks'
import type { TabId } from '@shared/types'
import OrchestrateTab from '@renderer/components/manage/ManageTab'
import AgentsTab from '@renderer/components/agents/AgentsTab'
import TasksTab from '@renderer/components/tasks/TasksTab'
import FilesTab from '@renderer/components/files/FilesTab'
import HistoryTab from '@renderer/components/history/HistoryTab'

const TABS: { id: TabId; Component: React.ComponentType }[] = [
  { id: 'orchestrate', Component: OrchestrateTab },
  { id: 'agents', Component: AgentsTab },
  { id: 'tasks', Component: TasksTab },
  { id: 'files', Component: FilesTab },
  { id: 'history', Component: HistoryTab }
]

function App(): React.JSX.Element {
  const activeTab = useAppStore((s) => s.activeTab)
  const loadLastFolder = useAppStore((s) => s.loadLastFolder)

  useEffect(() => {
    loadLastFolder()
  }, [loadLastFolder])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd/Ctrl+1–5: Switch tabs
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const idx = parseInt(e.key, 10) - 1
        if (TABS[idx]) {
          useAppStore.getState().setActiveTab(TABS[idx].id)
        }
        return
      }

      // Cmd/Ctrl+S: Save file (Files tab) or create save point input focus (History tab)
      if (e.key === 's') {
        e.preventDefault()
        const tab = useAppStore.getState().activeTab
        if (tab === 'files') {
          useFilesStore.getState().saveActiveFile().catch((err) => {
            console.error('[Shortcut] Failed to save file:', err)
          })
        } else if (tab === 'history') {
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
              useAppStore.getState().setActiveTab('agents')
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
        useAppStore.getState().setActiveTab('tasks')
        useTasksStore.getState().createTask('draft', 'New task').catch((err) => {
          console.error('[Shortcut] Failed to create task:', err)
        })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <TopNav />
      <main className="relative flex-1 overflow-hidden">
        {TABS.map(({ id, Component }) => (
          <div
            key={id}
            className={
              id === activeTab
                ? 'flex h-full w-full animate-in fade-in duration-150'
                : 'hidden'
            }
          >
            <Component />
          </div>
        ))}
      </main>
      <ToastContainer />
    </div>
  )
}

export default App
