import { useEffect, useRef } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import BrowserTabBar from './BrowserTabBar'
import BrowserToolbar from './BrowserToolbar'
import BrowserContentArea from './BrowserContentArea'

export default function BrowserTab(): React.JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const createTab = useBrowserStore((s) => s.createTab)
  const autoCreated = useRef(false)

  // Auto-create first tab when browser page is shown and no tabs exist
  useEffect(() => {
    if (tabs.length === 0 && !autoCreated.current) {
      autoCreated.current = true
      createTab().catch((err) => {
        autoCreated.current = false
        console.error('Failed to auto-create browser tab:', err)
      })
    }
  }, [tabs.length, createTab])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BrowserTabBar />
      <BrowserToolbar />
      <BrowserContentArea />
    </div>
  )
}
