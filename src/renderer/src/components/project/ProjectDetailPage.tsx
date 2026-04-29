import { useAppStore } from '@renderer/stores/app'
import type { ProjectDetailTabId } from '@shared/types'
import BrowserTab from '@renderer/components/browser/BrowserTab'
import FilesTab from '@renderer/components/files/FilesTab'
import HistoryTab from '@renderer/components/history/HistoryTab'
import CommandsTab from '@renderer/components/commands/CommandsTab'
import SkillsSettings from '@renderer/components/settings/SkillsSettings'
import { PROJECT_DETAIL_TABS } from '@renderer/lib/project-detail-tabs'

const TAB_COMPONENTS: Record<ProjectDetailTabId, React.ComponentType> = {
  browser: BrowserTab,
  commands: CommandsTab,
  files: FilesTab,
  history: HistoryTab,
  skills: SkillsSettings
}

export default function ProjectDetailPage(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const activeTab = useAppStore((s) => s.projectDetailTab)

  if (!currentFolder) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-600">
        Select a project to view details
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 w-full flex-1 flex-col">
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        {PROJECT_DETAIL_TABS.map(({ id }) => {
          const Component = TAB_COMPONENTS[id]
          return (
            <div
              key={id}
              className={
                activeTab === id
                  ? 'flex h-full min-w-0 w-full flex-1 animate-in fade-in duration-150'
                  : 'hidden'
              }
            >
              <Component />
            </div>
          )
        })}
      </div>
    </div>
  )
}
