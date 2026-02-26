import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/app'
import { useAgentStore } from '../../stores/agent'
import ApiKeyPrompt from './ApiKeyPrompt'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'

function SettingsIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.6 2.4a1.4 1.4 0 0 1 2.8 0v.3a1.1 1.1 0 0 0 1.6.95l.26-.15a1.4 1.4 0 0 1 1.4 2.43l-.26.15a1.1 1.1 0 0 0 0 1.9l.26.15a1.4 1.4 0 1 1-1.4 2.43l-.26-.15a1.1 1.1 0 0 0-1.6.94v.31a1.4 1.4 0 0 1-2.8 0v-.3a1.1 1.1 0 0 0-1.6-.95l-.26.15a1.4 1.4 0 1 1-1.4-2.43l.26-.15a1.1 1.1 0 0 0 0-1.9l-.26-.15a1.4 1.4 0 0 1 1.4-2.43l.26.15A1.1 1.1 0 0 0 6.6 2.7zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ManageTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const hasApiKey = useAgentStore((s) => s.hasApiKey)
  const streamingContent = useAgentStore((s) => s.streamingContent)
  const currentToolUses = useAgentStore((s) => s.currentToolUses)
  const checkApiKey = useAgentStore((s) => s.checkApiKey)
  const clearConversation = useAgentStore((s) => s.clearConversation)
  const resetState = useAgentStore((s) => s.resetState)

  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevFolderRef = useRef(currentFolder)

  // Check API key on mount
  useEffect(() => {
    checkApiKey()
  }, [checkApiKey])

  // Reset conversation when folder changes
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      prevFolderRef.current = currentFolder
      clearConversation()
      resetState()
      checkApiKey()
    }
  }, [currentFolder, clearConversation, resetState, checkApiKey])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // No folder selected
  if (!currentFolder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <h2 className="text-2xl font-semibold text-zinc-200">Manage</h2>
        <p className="text-zinc-500">Select a project folder to get started</p>
      </div>
    )
  }

  // No API key
  if (hasApiKey === false) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ApiKeyPrompt />
      </div>
    )
  }

  // Loading API key status
  if (hasApiKey === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  // Settings view (editing API key)
  if (showSettings) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ApiKeyPrompt onDone={() => setShowSettings(false)} />
      </div>
    )
  }

  // Chat interface
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          AI Project Manager
        </span>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center gap-2 pt-20 text-center">
            <h2 className="text-lg font-semibold text-zinc-300">AI Project Manager</h2>
            <p className="max-w-md text-sm text-zinc-500">
              Ask me to create tasks, manage files, review changes, spawn terminals, or manage save
              points. I can help you orchestrate your entire project.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            toolUses={msg.toolUses}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && (streamingContent || currentToolUses.length > 0) && (
          <ChatMessage
            role="assistant"
            content={streamingContent}
            toolUses={currentToolUses.length > 0 ? currentToolUses : undefined}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput />
    </div>
  )
}
