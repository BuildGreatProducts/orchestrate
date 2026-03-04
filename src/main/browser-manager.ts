import { BrowserWindow, WebContentsView } from 'electron'
import type { BrowserTabInfo, BrowserBounds } from '@shared/types'

interface ManagedBrowserTab {
  id: string
  view: WebContentsView
  bounds: BrowserBounds | null
  failedUrl: string | null
}

export class BrowserViewManager {
  private tabs = new Map<string, ManagedBrowserTab>()
  private getWindow: () => BrowserWindow | null

  constructor(
    getWindow: () => BrowserWindow | null,
    private onTabUpdated: (tab: BrowserTabInfo) => void,
    private onTabClosed: (id: string) => void
  ) {
    this.getWindow = getWindow
  }

  private buildTabInfo(id: string, view: WebContentsView): BrowserTabInfo {
    const wc = view.webContents
    const failedUrl = this.tabs.get(id)?.failedUrl

    return {
      id,
      url: failedUrl ?? wc.getURL(),
      title: failedUrl ? `Failed to load — ${failedUrl}` : wc.getTitle() || wc.getURL(),
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward()
    }
  }

  private emitUpdate(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.onTabUpdated(this.buildTabInfo(id, tab.view))
  }

  create(id: string, url: string): void {
    const win = this.getWindow()
    if (!win) return

    // Clean up existing tab with same id
    if (this.tabs.has(id)) {
      this.close(id)
    }

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const managed: ManagedBrowserTab = { id, view, bounds: null, failedUrl: null }
    this.tabs.set(id, managed)

    const wc = view.webContents

    wc.on('did-navigate', (_event, url) => {
      // Clear error state on successful navigation (not to our error page)
      if (!url.startsWith('data:')) {
        managed.failedUrl = null
      }
      this.emitUpdate(id)
    })
    wc.on('did-navigate-in-page', () => this.emitUpdate(id))
    wc.on('did-start-loading', () => this.emitUpdate(id))
    wc.on('did-stop-loading', () => this.emitUpdate(id))
    wc.on('page-title-updated', () => this.emitUpdate(id))
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      // Don't handle failures for our own error pages
      if (validatedURL.startsWith('data:')) return

      managed.failedUrl = validatedURL

      const isConnectionRefused = errorCode === -102
      const heading = isConnectionRefused ? 'Site can\u2019t be reached' : 'Failed to load page'
      const detail = isConnectionRefused
        ? `<strong style="color:#e4e4e7">${validatedURL}</strong> refused to connect.`
        : `${errorDescription} (${errorCode})`
      const hint = isConnectionRefused
        ? 'Check that the dev server is running and try again.'
        : ''

      const escapedUrl = validatedURL.replace(/'/g, "\\'")
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="background:#09090b;color:#a1a1aa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:420px;padding:0 24px">
    <div style="font-size:48px;margin-bottom:16px;opacity:0.4">&#128268;</div>
    <h2 style="color:#e4e4e7;margin:0 0 8px;font-size:18px;font-weight:600">${heading}</h2>
    <p style="margin:0 0 6px;font-size:14px;line-height:1.5">${detail}</p>
    ${hint ? `<p style="margin:0 0 20px;font-size:13px;color:#71717a">${hint}</p>` : '<div style="height:20px"></div>'}
    <button onclick="window.location.href='${escapedUrl}'" style="background:#27272a;color:#e4e4e7;border:1px solid #3f3f46;border-radius:6px;padding:8px 20px;font-size:14px;cursor:pointer;font-family:inherit;transition:background 0.15s" onmouseover="this.style.background='#3f3f46'" onmouseout="this.style.background='#27272a'">Retry</button>
  </div>
</body></html>`
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      this.emitUpdate(id)
    })

    wc.on('render-process-gone', () => {
      this.onTabClosed(id)
      this.tabs.delete(id)
    })

    win.contentView.addChildView(view)
    view.webContents.loadURL(url)
  }

  close(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      try {
        win.contentView.removeChildView(tab.view)
      } catch {
        // View may already be removed
      }
    }

    tab.view.webContents.close()
    this.tabs.delete(id)
  }

  setBounds(id: string, bounds: BrowserBounds): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.bounds = bounds
    tab.view.setBounds(bounds)
  }

  show(id: string): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return

    // Hide all views first
    for (const tab of this.tabs.values()) {
      try {
        win.contentView.removeChildView(tab.view)
      } catch {
        // Already removed
      }
    }

    // Show the target view
    const tab = this.tabs.get(id)
    if (!tab) return

    win.contentView.addChildView(tab.view)
    if (tab.bounds) {
      tab.view.setBounds(tab.bounds)
    }
  }

  hideAll(): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return

    for (const tab of this.tabs.values()) {
      try {
        win.contentView.removeChildView(tab.view)
      } catch {
        // Already removed
      }
    }
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.failedUrl = null
    tab.view.webContents.loadURL(url)
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.view.webContents.navigationHistory.goBack()
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.view.webContents.navigationHistory.goForward()
  }

  reload(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    // If on an error page, retry the original URL instead of reloading the data: page
    if (tab.failedUrl) {
      const url = tab.failedUrl
      tab.failedUrl = null
      tab.view.webContents.loadURL(url)
    } else {
      tab.view.webContents.reload()
    }
  }

  stop(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.view.webContents.stop()
  }

  toggleDevTools(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.view.webContents.toggleDevTools()
  }

  closeAll(): void {
    const win = this.getWindow()
    for (const tab of this.tabs.values()) {
      if (win && !win.isDestroyed()) {
        try {
          win.contentView.removeChildView(tab.view)
        } catch {
          // Already removed
        }
      }
      tab.view.webContents.close()
    }
    this.tabs.clear()
  }
}
