import { useAppStore } from '@renderer/stores/app'
import AgentColumn from '@renderer/components/agents/AgentColumn'
import BottomTerminalPanel from '@renderer/components/agents/BottomTerminalPanel'
import ProjectDetailPage from '@renderer/components/project/ProjectDetailPage'
import WorktreeDetailPage from '@renderer/components/worktree/WorktreeDetailPage'

export default function WorkspaceShell(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const contentView = useAppStore((s) => s.contentView)
  const bottomTerminalOpen = useAppStore((s) => s.bottomTerminalOpen)

  if (!currentFolder) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-zinc-800 bg-black text-sm text-zinc-600">
        Select a project to begin
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden gap-3">
      <AgentColumn projectFolder={currentFolder} />
      <div className="flex h-full min-w-0 flex-1 basis-0 flex-col overflow-hidden gap-3">
        <main className="min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden rounded-lg border border-zinc-800 bg-black">
          {contentView.type === 'worktree-detail' ? (
            <WorktreeDetailPage worktreePath={contentView.worktreePath} />
          ) : (
            <ProjectDetailPage />
          )}
        </main>
        {bottomTerminalOpen && <BottomTerminalPanel projectFolder={currentFolder} />}
      </div>
    </div>
  )
}
