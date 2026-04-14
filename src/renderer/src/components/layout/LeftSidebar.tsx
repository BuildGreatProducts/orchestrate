import { Music, Puzzle, Globe, FolderPlus } from 'lucide-react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import type { NavPageId } from '@shared/types'
import ConfirmDialog from '@renderer/components/history/ConfirmDialog'
import ProjectSection from './ProjectSection'

const GLOBAL_NAV: { id: NavPageId | 'orchestrate'; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'orchestrate', label: 'Orchestrate', icon: Music },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'browser', label: 'Browser', icon: Globe }
]

export default function LeftSidebar(): React.JSX.Element {
  const contentView = useAppStore((s) => s.contentView)
  const showPage = useAppStore((s) => s.showPage)
  const showOrchestrate = useAppStore((s) => s.showOrchestrate)
  const projects = useAppStore((s) => s.projects)
  const addProject = useAppStore((s) => s.addProject)
  const setProjectExpanded = useAppStore((s) => s.setProjectExpanded)

  const pendingCloseTabId = useTerminalStore((s) => s.pendingCloseTabId)
  const confirmCloseTab = useTerminalStore((s) => s.confirmCloseTab)
  const cancelCloseTab = useTerminalStore((s) => s.cancelCloseTab)

  const handleNavClick = (id: NavPageId | 'orchestrate'): void => {
    if (id === 'orchestrate') {
      showOrchestrate()
    } else {
      showPage(id as NavPageId)
    }
  }

  const isNavActive = (id: NavPageId | 'orchestrate'): boolean => {
    if (id === 'orchestrate') {
      return contentView.type === 'orchestrate'
    }
    return contentView.type === 'page' && contentView.pageId === id
  }

  const handleAddProject = async (): Promise<void> => {
    const folder = await window.orchestrate.selectFolder()
    if (folder) {
      await addProject(folder)
      setProjectExpanded(folder, true)
    }
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col bg-zinc-900">
      {/* Global navigation links */}
      <div className="flex flex-col gap-0.5 p-1.5">
        {GLOBAL_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNavClick(id)}
            className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
              isNavActive(id)
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="mx-3 my-1 h-px bg-zinc-800" />

      {/* Projects header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Projects</span>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto dark-scrollbar p-1.5">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 pt-8 text-center">
            <FolderPlus size={20} className="text-zinc-600" />
            <span className="text-xs text-zinc-600">Add a project to get started</span>
          </div>
        ) : (
          projects.map((folder) => (
            <ProjectSection key={folder} folder={folder} />
          ))
        )}
      </div>

      {/* Add project button */}
      <div className="px-2.5 pb-2.5">
        <button
          onClick={handleAddProject}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        >
          <FolderPlus size={14} />
          <span>Add project</span>
        </button>
      </div>

      {pendingCloseTabId !== null && (
        <ConfirmDialog
          title="Close Agent"
          description="This will terminate the running terminal process. Are you sure you want to close this agent?"
          confirmLabel="Close"
          variant="danger"
          onConfirm={confirmCloseTab}
          onCancel={cancelCloseTab}
        />
      )}
    </div>
  )
}
