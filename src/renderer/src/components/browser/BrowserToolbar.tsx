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
  const [urlInput, setUrlInput] = useState(activeTab?.url ?? '')

  // Sync URL input with active tab's current URL
  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url)
    }
  }, [activeTab?.url, activeTab?.id])

  const handleNavigate = (): void => {
    if (!activeTabId || !urlInput.trim()) return
    let url = urlInput.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`
    }
    navigate(activeTabId, url)
  }

  const btnClass =
    'rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400'

  return (
    <div className="flex h-10 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-2">
      <button
        className={btnClass}
        disabled={!activeTab?.canGoBack}
        onClick={() => activeTabId && goBack(activeTabId)}
        title="Back"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        className={btnClass}
        disabled={!activeTab?.canGoForward}
        onClick={() => activeTabId && goForward(activeTabId)}
        title="Forward"
      >
        <ArrowRight size={16} />
      </button>
      {activeTab?.isLoading ? (
        <button
          className={btnClass}
          onClick={() => activeTabId && stop(activeTabId)}
          title="Stop"
        >
          <X size={16} />
        </button>
      ) : (
        <button
          className={btnClass}
          onClick={() => activeTabId && reload(activeTabId)}
          title="Reload"
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
        />
      </div>
      <button
        className={btnClass}
        onClick={() => activeTabId && toggleDevTools(activeTabId)}
        title="Toggle DevTools"
      >
        <Wrench size={14} />
      </button>
    </div>
  )
}
