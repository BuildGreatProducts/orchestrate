import { useLayoutEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useBrowserStore } from '@renderer/stores/browser'

function visibleBrowserTabId(): string | null {
  const appState = useAppStore.getState()
  if (appState.contentView.type !== 'project-detail' || appState.projectDetailTab !== 'browser') {
    return null
  }
  return useBrowserStore.getState().activeTabId
}

export function useAppModalLayer(active: boolean): void {
  const openModalLayer = useAppStore((s) => s.openModalLayer)
  const closeModalLayer = useAppStore((s) => s.closeModalLayer)

  useLayoutEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const tabId = useAppStore.getState().modalLayerDepth === 0 ? visibleBrowserTabId() : null
    openModalLayer()

    const captureAndHideBrowser = async (): Promise<void> => {
      if (!tabId) return
      try {
        const snapshot = await window.orchestrate.captureBrowserTab(tabId)
        if (!cancelled && snapshot) {
          useAppStore.getState().setBrowserModalSnapshot({ tabId, ...snapshot })
        }
      } catch (err) {
        console.error('[ModalLayer] Failed to capture browser tab:', err)
      } finally {
        if (!cancelled) {
          window.orchestrate.hideAllBrowserTabs().catch((err) => {
            console.error('[ModalLayer] Failed to hide browser tabs:', err)
          })
        }
      }
    }

    void captureAndHideBrowser()

    return () => {
      cancelled = true
      closeModalLayer()
    }
  }, [active, closeModalLayer, openModalLayer])
}
