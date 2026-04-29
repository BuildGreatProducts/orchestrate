import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useTasksStore } from '@renderer/stores/tasks'
import AgentColumn from '@renderer/components/agents/AgentColumn'
import BottomTerminalPanel from '@renderer/components/agents/BottomTerminalPanel'
import ProjectDetailPage from '@renderer/components/project/ProjectDetailPage'
import WorktreeDetailPage from '@renderer/components/worktree/WorktreeDetailPage'
import TasksSidebar from '@renderer/components/tasks/TasksSidebar'
import { cn } from '@renderer/lib/utils'

export default function WorkspaceShell(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const contentView = useAppStore((s) => s.contentView)
  const bottomTerminalOpen = useAppStore((s) => s.bottomTerminalOpen)
  const tasksSidebarOpen = useAppStore((s) => s.tasksSidebarOpen)
  const loadTasks = useTasksStore((s) => s.loadTasks)
  const resetTasks = useTasksStore((s) => s.resetTasks)

  useEffect(() => {
    if (currentFolder) {
      loadTasks()
    } else {
      resetTasks()
    }
  }, [currentFolder, loadTasks, resetTasks])

  if (!currentFolder) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-black text-sm text-zinc-600">
        Select a project to begin
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-lg bg-black">
      <div
        aria-hidden={!tasksSidebarOpen}
        className={cn(
          'h-full min-h-0 shrink-0 overflow-hidden transition-[width,max-width,opacity,transform] duration-300 ease-out motion-reduce:transition-none',
          tasksSidebarOpen
            ? 'w-[340px] max-w-[34vw] translate-x-0 border-r-2 border-zinc-900 opacity-100'
            : 'pointer-events-none w-0 max-w-0 -translate-x-3 opacity-0'
        )}
      >
        <TasksSidebar projectFolder={currentFolder} />
      </div>
      <AgentColumn projectFolder={currentFolder} />
      <div className="flex h-full min-w-0 flex-1 basis-0 flex-col overflow-hidden">
        <main className="min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden bg-black">
          {contentView.type === 'worktree-detail' ? (
            <WorktreeDetailPage worktreePath={contentView.worktreePath} />
          ) : (
            <ProjectDetailPage />
          )}
        </main>
        <div
          aria-hidden={!bottomTerminalOpen}
          className={cn(
            'min-h-0 shrink-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out motion-reduce:transition-none',
            bottomTerminalOpen
              ? 'max-h-72 translate-y-0 opacity-100'
              : 'pointer-events-none max-h-0 translate-y-3 opacity-0'
          )}
        >
          <BottomTerminalPanel projectFolder={currentFolder} />
        </div>
      </div>
    </div>
  )
}
