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
    const el = e.target
    el.style.height = 'auto'
    const LINE_HEIGHT = 24
    const MAX_ROWS = 5
    el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_ROWS)}px`
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 pt-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
      <div className="pointer-events-auto flex w-full items-end gap-3 rounded-2xl bg-zinc-800/90 backdrop-blur-sm px-4 py-3 shadow-[0_2px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]" style={{ maxWidth: 600 }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-zinc-200 placeholder-zinc-500 outline-none disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={cancelMessage}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
            aria-label="Stop"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition-all hover:bg-zinc-100 active:scale-95 active:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
