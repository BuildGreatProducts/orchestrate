import { useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/app'
import { useAgentStore } from '../../stores/agent'
import Spinner from '@renderer/components/ui/Spinner'
import ApiKeyPrompt from './ApiKeyPrompt'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'

export default function OrchestrateTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const hasApiKey = useAgentStore((s) => s.hasApiKey)
  const streamingContent = useAgentStore((s) => s.streamingContent)
  const currentToolUses = useAgentStore((s) => s.currentToolUses)
  const checkApiKey = useAgentStore((s) => s.checkApiKey)
  const clearConversation = useAgentStore((s) => s.clearConversation)
  const resetState = useAgentStore((s) => s.resetState)

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
        <h2 className="text-2xl font-semibold text-zinc-200">Orchestrate</h2>
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Spinner className="text-zinc-500" />
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  // Chat interface
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
