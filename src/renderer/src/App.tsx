import { useEffect } from 'react'
import TopNav from '@renderer/components/layout/TopNav'
import { useAppStore } from '@renderer/stores/app'
import type { TabId } from '@shared/types'
import ManageTab from '@renderer/components/manage/ManageTab'
import AgentsTab from '@renderer/components/agents/AgentsTab'
import TasksTab from '@renderer/components/tasks/TasksTab'
import FilesTab from '@renderer/components/files/FilesTab'
import HistoryTab from '@renderer/components/history/HistoryTab'

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  manage: ManageTab,
  agents: AgentsTab,
  tasks: TasksTab,
  files: FilesTab,
  history: HistoryTab
}

function App(): React.JSX.Element {
  const activeTab = useAppStore((s) => s.activeTab)
  const loadLastFolder = useAppStore((s) => s.loadLastFolder)

  useEffect(() => {
    loadLastFolder()
  }, [loadLastFolder])

  const ActiveTabComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <TopNav />
      <main className="flex flex-1 overflow-hidden">
        <ActiveTabComponent />
      </main>
    </div>
  )
}

export default App
