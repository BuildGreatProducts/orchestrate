import { useState } from 'react'
import { useHistoryStore } from '@renderer/stores/history'

export default function CreateSavePoint(): React.JSX.Element {
  const [message, setMessage] = useState('')
  const gitStatus = useHistoryStore((s) => s.gitStatus)
  const createSavePoint = useHistoryStore((s) => s.createSavePoint)

  const hasChanges =
    gitStatus !== null &&
    (gitStatus.modified.length > 0 ||
      gitStatus.added.length > 0 ||
      gitStatus.deleted.length > 0 ||
      gitStatus.untracked.length > 0)

  const changeSummary = gitStatus
    ? [
        gitStatus.modified.length > 0 && `${gitStatus.modified.length} modified`,
        gitStatus.added.length > 0 && `${gitStatus.added.length} added`,
        gitStatus.deleted.length > 0 && `${gitStatus.deleted.length} deleted`,
        gitStatus.untracked.length > 0 && `${gitStatus.untracked.length} untracked`
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  const canSave = message.trim().length > 0 && hasChanges

  const handleSubmit = async (): Promise<void> => {
    if (!canSave) return
    await createSavePoint(message.trim())
    setMessage('')
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey && canSave) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-b border-zinc-800 p-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what changed..."
          className="flex-1 rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSave}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {changeSummary && (
        <p className="mt-1.5 text-xs text-zinc-500">{changeSummary}</p>
      )}
      {!hasChanges && gitStatus !== null && (
        <p className="mt-1.5 text-xs text-zinc-600">No changes to save</p>
      )}
    </div>
  )
}
