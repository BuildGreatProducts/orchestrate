import { useState, useEffect } from 'react'

export default function SettingsPage(): React.JSX.Element {
  const [version, setVersion] = useState<string>('')
  const [defaultUrl, setDefaultUrl] = useState<string>('')
  const [savedUrl, setSavedUrl] = useState<string>('')

  useEffect(() => {
    setVersion(navigator.userAgent.match(/Orchestrate\/([^\s]+)/)?.[1] ?? '1.0.0')
    window.orchestrate.getSetting('defaultBrowserUrl').then((val) => {
      const url = typeof val === 'string' ? val : 'http://localhost:3000'
      setDefaultUrl(url)
      setSavedUrl(url)
    })
  }, [])

  const handleSaveUrl = async (): Promise<void> => {
    const trimmed = defaultUrl.trim() || 'http://localhost:3000'
    await window.orchestrate.setSetting('defaultBrowserUrl', trimmed)
    setDefaultUrl(trimmed)
    setSavedUrl(trimmed)
  }

  const isDirty = defaultUrl !== savedUrl

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">General application preferences.</p>
        </div>

        {/* Browser section */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Browser</h3>
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <label className="block text-sm text-zinc-300">Default URL</label>
            <p className="mt-0.5 text-xs text-zinc-500">
              The URL opened when creating a new browser tab.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={defaultUrl}
                onChange={(e) => setDefaultUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveUrl()
                  if (e.metaKey || e.ctrlKey) e.stopPropagation()
                }}
                placeholder="http://localhost:3000"
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleSaveUrl}
                disabled={!isDirty}
                className="rounded bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* About section */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">About</h3>
          <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Orchestrate</span>
              <span className="text-xs text-zinc-500">v{version}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              AI agent orchestration for your projects.
            </p>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Keyboard Shortcuts
          </h3>
          <div className="space-y-1">
            {[
              { keys: '\u2318/Ctrl + T', action: 'New agent' },
              { keys: '\u2318/Ctrl + N', action: 'New task' },
              { keys: '\u2318/Ctrl + S', action: 'Save file / focus save point' },
              { keys: '\u2318/Ctrl + 1-5', action: 'Switch pages' }
            ].map(({ keys, action }) => (
              <div
                key={action}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-4 py-2"
              >
                <span className="text-sm text-zinc-400">{action}</span>
                <kbd className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
