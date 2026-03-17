import { useEffect, useRef } from 'react'
import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import { useAgentStore } from '../../stores/agent'
import { useChatHistoryStore } from '../../stores/chat-history'
import Spinner from '@renderer/components/ui/Spinner'
import ApiKeyPrompt from './ApiKeyPrompt'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ConversationPanel from './ConversationPanel'

export default function OrchestrateTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const hasApiKey = useAgentStore((s) => s.hasApiKey)
  const streamingItems = useAgentStore((s) => s.streamingItems)
  const checkApiKey = useAgentStore((s) => s.checkApiKey)
  const clearConversation = useAgentStore((s) => s.clearConversation)
  const resetState = useAgentStore((s) => s.resetState)

  const panelOpen = useChatHistoryStore((s) => s.panelOpen)
  const togglePanel = useChatHistoryStore((s) => s.togglePanel)
  const loadConversations = useChatHistoryStore((s) => s.loadConversations)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevFolderRef = useRef(currentFolder)

  // Check API key on mount
  useEffect(() => {
    checkApiKey()
  }, [checkApiKey])

  // Load conversations on mount
  useEffect(() => {
    if (currentFolder) {
      loadConversations()
    }
  }, [currentFolder, loadConversations])

  // Reset conversation when folder changes
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      // Save current conversation before switching
      useChatHistoryStore.getState().saveCurrentConversation()

      prevFolderRef.current = currentFolder
      clearConversation()
      resetState()
      checkApiKey()

      // Reset active conversation and load new project's conversations
      useChatHistoryStore.setState({ activeConversationId: null })
      if (currentFolder) {
        useChatHistoryStore.getState().loadConversations()
      }
    }
  }, [currentFolder, clearConversation, resetState, checkApiKey])

  // Auto-scroll to bottom — use 'auto' during streaming to avoid jitter
  useEffect(() => {
    const behavior = streamingItems.length > 0 ? 'auto' : 'smooth'
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [messages, streamingItems])

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
    <div className="flex flex-1 overflow-hidden">
      {panelOpen && <ConversationPanel />}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Toggle panel button */}
        <button
          onClick={togglePanel}
          className="absolute left-2 top-2 z-10 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={panelOpen ? 'Close chat history panel' : 'Open chat history panel'}
        >
          {panelOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>

        <div className="flex-1 overflow-y-auto dark-scrollbar">
          <div className="mx-auto w-full max-w-[900px] py-4 pb-24">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center">
                <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
                <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
                  Create tasks, manage files, review changes,
                  <br />
                  and orchestrate your entire project.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolUses={msg.toolUses}
                items={msg.items}
              />
            ))}

            {/* Streaming message */}
            {isStreaming && streamingItems.length > 0 && (
              <ChatMessage role="assistant" content="" items={streamingItems} />
            )}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="flex items-center gap-1">
                  <div className="stream-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  <div className="stream-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  <div className="stream-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
                </div>
                {streamingItems.length === 0 && (
                  <span className="text-xs text-zinc-500">Agent is thinking…</span>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <ChatInput />
      </div>
    </div>
  )
}
