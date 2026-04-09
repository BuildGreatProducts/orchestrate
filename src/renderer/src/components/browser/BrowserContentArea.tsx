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
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const contentView = useAppStore((s) => s.contentView)

  // Reset cached bounds when switching browser sub-tabs
  const prevTabIdRef = useRef(activeTabId)
  if (prevTabIdRef.current !== activeTabId) {
    prevTabIdRef.current = activeTabId
    lastBoundsRef.current = null
  }

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
    const shouldShow = contentView.type === 'page' && contentView.pageId === 'browser' && activeTabId
    if (shouldShow) {
      window.orchestrate.showBrowserTab(activeTabId)
      // Report bounds after showing, with a small delay for layout to settle
      requestAnimationFrame(() => reportBounds())
    } else {
      window.orchestrate.hideAllBrowserTabs()
    }
  }, [contentView, activeTabId, reportBounds])

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
