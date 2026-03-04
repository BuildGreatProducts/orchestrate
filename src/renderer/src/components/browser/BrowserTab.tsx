import { useEffect, useRef } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import { useAppStore } from '@renderer/stores/app'
import BrowserTabBar from './BrowserTabBar'
import BrowserToolbar from './BrowserToolbar'
import BrowserContentArea from './BrowserContentArea'

export default function BrowserTab(): React.JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const createTab = useBrowserStore((s) => s.createTab)
  const closeAllTabs = useBrowserStore((s) => s.closeAllTabs)
  const currentFolder = useAppStore((s) => s.currentFolder)
  const autoCreated = useRef(false)

  // Close all browser tabs when project folder changes
  useEffect(() => {
    closeAllTabs()
    autoCreated.current = false
  }, [currentFolder, closeAllTabs])

  // Auto-create first tab when folder is selected and no tabs exist
  useEffect(() => {
    if (currentFolder && tabs.length === 0 && !autoCreated.current) {
      autoCreated.current = true
      createTab().catch((err) => {
        console.error('Failed to auto-create browser tab:', err)
      })
    }
  }, [currentFolder, tabs.length, createTab])

  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h2 className="text-2xl font-semibold text-zinc-200">Browser</h2>
        <p className="text-zinc-500">Select a project folder to start browsing</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BrowserTabBar />
      <BrowserToolbar />
      <BrowserContentArea />
    </div>
  )
}
