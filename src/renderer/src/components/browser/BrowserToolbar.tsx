/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Globe, Wrench } from 'lucide-react'
import { useBrowserStore } from '@renderer/stores/browser'

export default function BrowserToolbar(): React.JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const navigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
  const stop = useBrowserStore((s) => s.stop)
  const toggleDevTools = useBrowserStore((s) => s.toggleDevTools)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeTabUrl = activeTab?.url
  const activeBrowserTabId = activeTab?.id
  const [urlInput, setUrlInput] = useState(activeTab?.url ?? '')

  // Sync URL input with active tab's current URL
  useEffect(() => {
    if (activeTabUrl !== undefined) {
      setUrlInput(activeTabUrl)
    }
  }, [activeTabUrl, activeBrowserTabId])

  const handleNavigate = (): void => {
    if (!activeTabId || !urlInput.trim()) return
    const raw = urlInput.trim()
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
    try {
      const parsed = new URL(withScheme)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
      navigate(activeTabId, parsed.toString())
    } catch {
      // Invalid URL — don't navigate
    }
  }

  const btnClass =
    'rounded p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400'

  return (
    <div className="flex h-10 items-center gap-1.5 border-b border-zinc-800 bg-black px-2">
      <button
        className={btnClass}
        disabled={!activeTab?.canGoBack}
        onClick={() => activeTabId && goBack(activeTabId)}
        title="Back"
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        className={btnClass}
        disabled={!activeTab?.canGoForward}
        onClick={() => activeTabId && goForward(activeTabId)}
        title="Forward"
        aria-label="Forward"
      >
        <ArrowRight size={16} />
      </button>
      {activeTab?.isLoading ? (
        <button
          className={btnClass}
          onClick={() => activeTabId && stop(activeTabId)}
          title="Stop loading"
          aria-label="Stop loading"
        >
          <X size={16} />
        </button>
      ) : (
        <button
          className={btnClass}
          onClick={() => activeTabId && reload(activeTabId)}
          title="Reload"
          aria-label="Reload"
        >
          <RotateCw size={14} />
        </button>
      )}
      <div className="flex flex-1 items-center gap-2 rounded-md bg-zinc-800 px-2.5 py-1.5">
        <Globe size={14} className="shrink-0 text-zinc-500" />
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleNavigate()
            }
          }}
          className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder="Enter URL..."
          aria-label="Address bar"
        />
      </div>
      <button
        className={btnClass}
        onClick={() => activeTabId && toggleDevTools(activeTabId)}
        title="Toggle developer tools"
        aria-label="Toggle developer tools"
      >
        <Wrench size={14} />
      </button>
    </div>
  )
}
