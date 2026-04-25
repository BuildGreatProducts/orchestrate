import { useAppStore } from '@renderer/stores/app'
import AgentColumn from '@renderer/components/agents/AgentColumn'
import BottomTerminalPanel from '@renderer/components/agents/BottomTerminalPanel'
import ProjectDetailPage from '@renderer/components/project/ProjectDetailPage'
import WorktreeDetailPage from '@renderer/components/worktree/WorktreeDetailPage'
import { cn } from '@renderer/lib/utils'

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
      <div className="flex h-full min-w-0 flex-1 basis-0 flex-col overflow-hidden">
        <main className="min-h-0 min-w-0 w-full flex-1 basis-0 overflow-hidden rounded-lg border border-zinc-800 bg-black">
          {contentView.type === 'worktree-detail' ? (
            <WorktreeDetailPage worktreePath={contentView.worktreePath} />
          ) : (
            <ProjectDetailPage />
          )}
        </main>
        <div
          aria-hidden={!bottomTerminalOpen}
          className={cn(
            'min-h-0 shrink-0 overflow-hidden transition-[max-height,opacity,transform,margin-top] duration-300 ease-out motion-reduce:transition-none',
            bottomTerminalOpen
              ? 'mt-3 max-h-72 translate-y-0 opacity-100'
              : 'pointer-events-none mt-0 max-h-0 translate-y-3 opacity-0'
          )}
        >
          <BottomTerminalPanel projectFolder={currentFolder} />
        </div>
      </div>
    </div>
  )
}
