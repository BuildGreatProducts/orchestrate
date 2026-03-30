import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { useChatHistoryStore } from '../../stores/chat-history'
import type { ChatConversationSummary } from '@shared/types'

// Fix #12: guard against malformed dates
function relativeTime(dateStr: string): string {
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return ''
  const now = Date.now()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete
}: {
  conversation: ChatConversationSummary
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      className={`group flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
        isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="truncate text-sm text-zinc-200">{conversation.title}</span>
        {/* Fix #11: confirm before deleting */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('Delete this conversation?')) {
              onDelete()
            }
          }}
          className="mt-0.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Delete conversation"
        >
          <Trash2 size={13} className="text-zinc-500 hover:text-red-400" />
        </button>
      </div>
      {conversation.preview && (
        <span className="truncate text-xs text-zinc-500">{conversation.preview}</span>
      )}
      <span className="text-xs text-zinc-600">{relativeTime(conversation.updatedAt)}</span>
    </button>
  )
}

export default function ConversationPanel(): React.JSX.Element {
  const conversations = useChatHistoryStore((s) => s.conversations)
  const activeConversationId = useChatHistoryStore((s) => s.activeConversationId)
  const panelOpen = useChatHistoryStore((s) => s.panelOpen)
  const newConversation = useChatHistoryStore((s) => s.newConversation)
  const selectConversation = useChatHistoryStore((s) => s.selectConversation)
  const deleteConversation = useChatHistoryStore((s) => s.deleteConversation)

  return (
    <div
      className={`shrink-0 overflow-hidden border-r border-zinc-800 bg-zinc-900 transition-all duration-200 ease-out ${
        panelOpen ? 'w-64' : 'w-0 border-r-0'
      }`}
    >
      <div className="flex h-full w-64 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Chats
          </span>
          <button
            onClick={newConversation}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="New conversation"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto dark-scrollbar p-1.5">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 pt-12 text-center">
              <MessageSquare size={20} className="text-zinc-600" />
              <span className="text-xs text-zinc-600">No conversations yet</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={() => selectConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
