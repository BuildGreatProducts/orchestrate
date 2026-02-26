import { useState, useRef, useCallback } from 'react'
import { useAgentStore } from '../../stores/agent'

export default function ChatInput(): React.JSX.Element {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const sendMessage = useAgentStore((s) => s.sendMessage)
  const cancelMessage = useAgentStore((s) => s.cancelMessage)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    setText('')
    sendMessage(trimmed)
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, isStreaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setText(e.target.value)
    // Auto-expand textarea
    const el = e.target
    el.style.height = 'auto'
    const maxHeight = 5 * 24 // ~5 rows
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

  return (
    <div className="border-t border-zinc-700 bg-zinc-900 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask your AI project manager..."
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500 disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={cancelMessage}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
