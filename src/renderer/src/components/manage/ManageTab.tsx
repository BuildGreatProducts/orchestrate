import { useEffect, useRef } from 'react'
import { PanelLeft } from 'lucide-react'
import { useAppStore } from '../../stores/app'
import { useAgentStore } from '../../stores/agent'
import { useChatHistoryStore } from '../../stores/chat-history'
import Spinner from '@renderer/components/ui/Spinner'
import ApiKeyPrompt from './ApiKeyPrompt'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ConversationPanel from './ConversationPanel'
import AgentModeToggle from './AgentModeToggle'

export default function OrchestrateTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const messages = useAgentStore((s) => s.messages)
  const isStreaming = useAgentStore((s) => s.isStreaming)
  const hasApiKey = useAgentStore((s) => s.hasApiKey)
  const streamingItems = useAgentStore((s) => s.streamingItems)
  const checkApiKey = useAgentStore((s) => s.checkApiKey)
  const clearConversation = useAgentStore((s) => s.clearConversation)
  const resetState = useAgentStore((s) => s.resetState)
  const agentMode = useAgentStore((s) => s.agentMode)
  const cliAvailable = useAgentStore((s) => s.cliAvailable)

  const panelOpen = useChatHistoryStore((s) => s.panelOpen)
  const setPanelOpen = useChatHistoryStore((s) => s.setPanelOpen)
  const loadConversations = useChatHistoryStore((s) => s.loadConversations)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevFolderRef = useRef(currentFolder)

  // Check API key on mount
  useEffect(() => {
    checkApiKey()
  }, [checkApiKey])

  // Load conversations when folder changes (single source of truth — Fix #13)
  useEffect(() => {
    if (currentFolder) {
      loadConversations()
    }
  }, [currentFolder, loadConversations])

  // Fix #1: await saveCurrentConversation before clearing state on folder change
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      const prev = prevFolderRef.current
      prevFolderRef.current = currentFolder

      // Only save if switching away from a folder (not initial mount)
      const doSwitch = async (): Promise<void> => {
        if (prev) {
          try {
            await useChatHistoryStore.getState().saveCurrentConversation()
          } catch {
            // Save failed — proceed with switch anyway since folder already changed
          }
        }
        clearConversation()
        resetState()
        checkApiKey()
        useChatHistoryStore.setState({ activeConversationId: null })
      }
      doSwitch()
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

  // In CLI mode: show install prompt if CLI not available
  if (agentMode === 'cli' && cliAvailable === false) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="absolute right-2 top-2 z-10">
          <AgentModeToggle />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <h2 className="text-xl font-semibold text-zinc-200">Claude Code CLI Required</h2>
          <p className="max-w-md text-sm leading-relaxed text-zinc-400">
            CLI mode uses your Claude Code subscription. Install the CLI to get started, or switch
            to API mode.
          </p>
          <code className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300">
            npm install -g @anthropic-ai/claude-code
          </code>
        </div>
      </div>
    )
  }

  // In SDK mode: no API key
  if (agentMode === 'sdk' && hasApiKey === false) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="absolute right-2 top-2 z-10">
          <AgentModeToggle />
        </div>
        <ApiKeyPrompt />
      </div>
    )
  }

  // Loading state
  if (hasApiKey === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <Spinner className="text-zinc-500" />
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    )
  }

  // Chat interface
  return (
    <div className="flex flex-1 flex-row overflow-hidden">
      <ConversationPanel />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Toggle panel button (left) */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute left-2 top-2 z-10 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={panelOpen ? 'Close chat history panel' : 'Open chat history panel'}
        >
          <PanelLeft size={16} />
        </button>

        {/* Agent mode toggle (right) */}
        <div className="absolute right-2 top-2 z-10">
          <AgentModeToggle />
        </div>

        <div className="flex-1 overflow-y-auto dark-scrollbar">
          <div className="mx-auto w-full max-w-[900px] py-4 pb-24">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center">
                <h2 className="font-ovo text-6xl tracking-tight text-zinc-200">Orchestrate</h2>
                <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
                  Create loops, manage files, review changes,
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
                  <span className="text-xs text-zinc-500">Agent is thinking...</span>
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
