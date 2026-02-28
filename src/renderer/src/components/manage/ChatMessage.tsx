import ToolUseIndicator from './ToolUseIndicator'

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
}

function renderMarkdown(text: string): React.JSX.Element[] {
  const parts: React.JSX.Element[] = []
  const lines = text.split('\n')
  let i = 0
  let key = 0

  while (i < lines.length) {
    // Detect fenced code blocks
    if (lines[i].startsWith('```')) {
      const lang = lines[i].slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing ```
      parts.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-sm text-zinc-300"
        >
          <code data-lang={lang || undefined}>{codeLines.join('\n')}</code>
        </pre>
      )
    } else {
      // Regular text line — collect consecutive non-code lines
      const textLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        textLines.push(lines[i])
        i++
      }
      parts.push(
        <span key={key++} className="whitespace-pre-wrap">
          {textLines.join('\n')}
        </span>
      )
    }
  }

  return parts
}

export default function ChatMessage({
  role,
  content,
  toolUses
}: ChatMessageProps): React.JSX.Element {
  if (role === 'system') {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="max-w-lg rounded bg-red-900/20 px-3 py-2 text-center text-sm text-red-400">
          {content}
        </div>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className="flex justify-end px-4 py-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
          <span className="whitespace-pre-wrap">{content}</span>
        </div>
      </div>
    )
  }

  // Assistant
  return (
    <div className="flex justify-start px-4 py-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 shadow-sm">
        {toolUses && toolUses.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {toolUses.map((tu, idx) => (
              <ToolUseIndicator key={idx} tool={tu.tool} input={tu.input} />
            ))}
          </div>
        )}
        {content && <div>{renderMarkdown(content)}</div>}
      </div>
    </div>
  )
}
