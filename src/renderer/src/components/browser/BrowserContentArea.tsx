import { useEffect, useRef, useCallback } from 'react'
import { useBrowserStore } from '@renderer/stores/browser'
import { useAppStore } from '@renderer/stores/app'
import type { BrowserBounds } from '@shared/types'

function boundsEqual(a: BrowserBounds | null, b: BrowserBounds): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export default function BrowserContentArea(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastBoundsRef = useRef<BrowserBounds | null>(null)
  const activeTab = useBrowserStore((s) => {
    if (!s.activeTabId) return null
    return s.tabs.find((tab) => tab.id === s.activeTabId) ?? null
  })
  const activeTabId = activeTab?.id ?? null
  const contentView = useAppStore((s) => s.contentView)
  const projectDetailTab = useAppStore((s) => s.projectDetailTab)
  const modalLayerOpen = useAppStore((s) => s.modalLayerDepth > 0)

  // Reset cached bounds when switching browser sub-tabs
  const prevTabIdRef = useRef(activeTabId)

  useEffect(() => {
    if (prevTabIdRef.current !== activeTabId) {
      prevTabIdRef.current = activeTabId
      lastBoundsRef.current = null
    }
  }, [activeTabId])

  const reportBounds = useCallback(() => {
    if (!containerRef.current || !activeTabId) return
    const rect = containerRef.current.getBoundingClientRect()
    const bounds: BrowserBounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
    if (bounds.width > 0 && bounds.height > 0 && !boundsEqual(lastBoundsRef.current, bounds)) {
      lastBoundsRef.current = bounds
      window.orchestrate.setBrowserBounds(activeTabId, bounds)
    }
  }, [activeTabId])

  // Show/hide views based on whether the browser tab is active and settings are closed
  useEffect(() => {
    if (modalLayerOpen) {
      window.orchestrate.hideAllBrowserTabs()
      return undefined
    }

    const shouldShow =
      contentView.type === 'project-detail' && projectDetailTab === 'browser' && activeTabId
    if (shouldShow) {
      window.orchestrate.showBrowserTab(activeTabId)

      let settleTimeoutId: number | undefined
      let retryTimeoutId: number | undefined
      const frameId = requestAnimationFrame(() => {
        reportBounds()

        // The first show can race the BrowserView creation path.
        settleTimeoutId = window.setTimeout(() => {
          window.orchestrate.showBrowserTab(activeTabId)
          reportBounds()
        }, 50)

        retryTimeoutId = window.setTimeout(() => {
          window.orchestrate.showBrowserTab(activeTabId)
          reportBounds()
        }, 150)
      })

      return () => {
        cancelAnimationFrame(frameId)
        if (settleTimeoutId !== undefined) window.clearTimeout(settleTimeoutId)
        if (retryTimeoutId !== undefined) window.clearTimeout(retryTimeoutId)
      }
    } else {
      window.orchestrate.hideAllBrowserTabs()
    }
    return undefined
  }, [
    contentView,
    projectDetailTab,
    activeTabId,
    activeTab?.url,
    activeTab?.title,
    activeTab?.isLoading,
    modalLayerOpen,
    reportBounds
  ])

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
