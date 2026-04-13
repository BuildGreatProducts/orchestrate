import { LayoutList, FolderOpen, History, TerminalSquare } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import type { ProjectDetailTabId } from '@shared/types'
import TasksTab from '@renderer/components/tasks/TasksTab'
import FilesTab from '@renderer/components/files/FilesTab'
import HistoryTab from '@renderer/components/history/HistoryTab'
import CommandsTab from '@renderer/components/commands/CommandsTab'

const TABS: { id: ProjectDetailTabId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'tasks', label: 'Tasks', icon: LayoutList },
  { id: 'commands', label: 'Commands', icon: TerminalSquare },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'history', label: 'History', icon: History }
]

const TAB_COMPONENTS: Record<ProjectDetailTabId, React.ComponentType> = {
  tasks: TasksTab,
  commands: CommandsTab,
  files: FilesTab,
  history: HistoryTab
}

export default function ProjectDetailPage(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const activeTab = useAppStore((s) => s.projectDetailTab)
  const setTab = useAppStore((s) => s.setProjectDetailTab)

  if (!currentFolder) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-600">
        Select a project to view details
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-4 pt-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'border-b-2 border-white text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {TABS.map(({ id }) => {
          const Component = TAB_COMPONENTS[id]
          return (
            <div
              key={id}
              className={activeTab === id ? 'flex h-full w-full animate-in fade-in duration-150' : 'hidden'}
            >
              <Component />
            </div>
          )
        })}
      </div>
    </div>
  )
}
