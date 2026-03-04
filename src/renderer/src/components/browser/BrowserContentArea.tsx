import { useEffect, useRef, useCallback } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import { useAppStore } from '@renderer/stores/app'

export default function BrowserContentArea(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const activeTab = useAppStore((s) => s.activeTab)
  const showSettings = useAppStore((s) => s.showSettings)

  const reportBounds = useCallback(() => {
    if (!containerRef.current || !activeTabId) return
    const rect = containerRef.current.getBoundingClientRect()
    const bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
    if (bounds.width > 0 && bounds.height > 0) {
      window.orchestrate.setBrowserBounds(activeTabId, bounds)
    }
  }, [activeTabId])

  // Show/hide views based on whether the browser tab is active and settings are closed
  useEffect(() => {
    const shouldShow = activeTab === 'browser' && !showSettings && activeTabId
    if (shouldShow) {
      window.orchestrate.showBrowserTab(activeTabId)
      // Report bounds after showing, with a small delay for layout to settle
      requestAnimationFrame(() => reportBounds())
    } else {
      window.orchestrate.hideAllBrowserTabs()
    }
  }, [activeTab, showSettings, activeTabId, reportBounds])

  // ResizeObserver to continuously report bounds
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      reportBounds()
    })
    observer.observe(el)

    return () => observer.disconnect()
  }, [reportBounds])

  // Hide views on unmount
  useEffect(() => {
    return () => {
      window.orchestrate.hideAllBrowserTabs()
    }
  }, [])

  return <div ref={containerRef} className="flex-1" />
}
