import { useEffect } from 'react'
import TopNav from '@renderer/components/layout/TopNav'
import { useAppStore } from '@renderer/stores/app'
import type { TabId } from '@shared/types'
import ManageTab from '@renderer/components/manage/ManageTab'
import AgentsTab from '@renderer/components/agents/AgentsTab'
import TasksTab from '@renderer/components/tasks/TasksTab'
import FilesTab from '@renderer/components/files/FilesTab'
import HistoryTab from '@renderer/components/history/HistoryTab'

const TABS: { id: TabId; Component: React.ComponentType }[] = [
  { id: 'manage', Component: ManageTab },
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

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <TopNav />
      <main className="relative flex-1 overflow-hidden">
        {TABS.map(({ id, Component }) => (
          <div
            key={id}
            className={id === activeTab ? 'flex h-full w-full' : 'hidden'}
          >
            <Component />
          </div>
        ))}
      </main>
    </div>
  )
}

export default App
