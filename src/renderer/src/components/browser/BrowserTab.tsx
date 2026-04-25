import { useEffect } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import { useAppStore } from '@renderer/stores/app'
import BrowserTabBar from './BrowserTabBar'
import BrowserToolbar from './BrowserToolbar'
import BrowserContentArea from './BrowserContentArea'

export default function BrowserTab(): React.JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const createTab = useBrowserStore((s) => s.createTab)
  const contentView = useAppStore((s) => s.contentView)
  const projectDetailTab = useAppStore((s) => s.projectDetailTab)
  const isVisible = contentView.type === 'project-detail' && projectDetailTab === 'browser'

  // Auto-create first tab when browser page is visible and no tabs exist
  useEffect(() => {
    if (isVisible && tabs.length === 0) {
      createTab().catch((err) => {
        console.error('Failed to auto-create browser tab:', err)
      })
    }
  }, [isVisible, tabs.length, createTab])

  return (
    <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-hidden rounded-b-lg">
      <BrowserTabBar />
      <BrowserToolbar />
      <BrowserContentArea />
    </div>
  )
}
