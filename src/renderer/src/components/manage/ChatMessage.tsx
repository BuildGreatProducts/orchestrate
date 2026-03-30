import {
  Pencil,
  FileText,
  Search,
  SquareTerminal,
  Repeat,
  Trash2,
  List,
  Play,
  Save,
  RotateCcw,
  Undo2,
  GitBranch,
  LayoutList,
  ArrowRight,
  SendHorizontal,
  type LucideIcon
} from 'lucide-react'
import type { StreamItem } from '../../stores/agent'

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolUses?: { tool: string; input: Record<string, unknown> }[]
  items?: StreamItem[]
}

// --- Past-tense labels for tool actions ---

const TOOL_PAST_LABELS: Record<string, string> = {
  create_task: 'Created task',
  edit_task: 'Edited task',
  delete_task: 'Deleted task',
  move_task: 'Moved task',
  list_tasks: 'Listed tasks',
  read_task: 'Read task',
  send_to_agent: 'Sent to agent',
  list_loops: 'Listed loops',
  create_loop: 'Created loop',
  trigger_loop: 'Triggered loop',
  spawn_terminal: 'Opened terminal',
  read_file: 'Read file',
  write_file: 'Wrote file',
  list_files: 'Listed files',
  delete_file: 'Deleted file',
  create_save_point: 'Created save point',
  list_save_points: 'Listed save points',
  restore_save_point: 'Restored save point',
  revert_save_point: 'Reverted save point',
  get_changes: 'Got changes',
  Read: 'Read',
  Write: 'Wrote',
  Edit: 'Edited',
  Bash: 'Ran',
  Glob: 'Found files',
  Grep: 'Searched'
}

// --- Icon mapping ---

const TOOL_ICONS: Record<string, LucideIcon> = {
  Write: Pencil,
  Edit: Pencil,
  write_file: Pencil,
  Read: FileText,
  read_file: FileText,
  Glob: Search,
  Grep: Search,
  list_files: Search,
  Bash: SquareTerminal,
  spawn_terminal: SquareTerminal,
  create_task: LayoutList,
  edit_task: Pencil,
  delete_task: Trash2,
  move_task: ArrowRight,
  list_tasks: List,
  read_task: FileText,
  send_to_agent: SendHorizontal,
  list_loops: List,
  create_loop: Repeat,
  trigger_loop: Play,
  create_save_point: Save,
  restore_save_point: RotateCcw,
  revert_save_point: Undo2,
  list_save_points: List,
  get_changes: GitBranch,
  delete_file: Trash2
}

function getToolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[tool] || FileText
}

function getToolLabel(tool: string): string {
  return TOOL_PAST_LABELS[tool] || tool
}

function coerceToString(val: unknown): string | null {
  if (typeof val === 'string') return val || null
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return null
}

function getToolDetail(input: Record<string, unknown>): string | null {
  const keys = ['title', 'file_path', 'path', 'command', 'pattern', 'query', 'name', 'task_id', 'message']
  for (const key of keys) {
    const detail = coerceToString(input[key])
    if (detail) return detail.length > 50 ? detail.slice(0, 50) + '…' : detail
  }
  return null
}

// --- Build items from legacy messages (backward compat) ---

function buildItemsFromLegacy(
  content: string,
  toolUses?: { tool: string; input: Record<string, unknown> }[]
): StreamItem[] {
  const items: StreamItem[] = []
  if (toolUses) {
    for (const tu of toolUses) {
      items.push({ kind: 'tool_use', tool: tu.tool, input: tu.input })
    }
  }
  if (content) {
    items.push({ kind: 'text', content })
  }
  return items
}

// --- Inline markdown formatting ---

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Match bold, italic, inline code, and links
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g
  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    if (match[2]) {
      nodes.push(<strong key={key++} className="font-semibold text-zinc-100">{match[2]}</strong>)
    } else if (match[4]) {
      nodes.push(<em key={key++} className="italic text-zinc-300">{match[4]}</em>)
    } else if (match[6]) {
      nodes.push(
        <code key={key++} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-300">
          {match[6]}
        </code>
      )
    } else if (match[8] && match[9]) {
      let href = '#'
      try {
        const url = new URL(match[9])
        if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          href = url.href
        }
      } catch {
        // invalid URL — keep href as '#'
      }
      nodes.push(
        <a key={key++} className="text-blue-400 underline decoration-blue-400/30 hover:decoration-blue-400" href={href} rel="noopener noreferrer" target="_blank">
          {match[8]}
        </a>
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) {
    nodes.push(text.slice(last))
  }
  return nodes
}

// --- Markdown renderer ---

function renderMarkdown(text: string): React.JSX.Element[] {
  const parts: React.JSX.Element[] = []
  const lines = text.split('\n')
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      parts.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm leading-relaxed text-zinc-300"
        >
          <code data-lang={lang || undefined}>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = headingMatch[2]
      const cls =
        level === 1
          ? 'mt-4 mb-2 font-sans text-lg font-semibold text-zinc-100'
          : level === 2
            ? 'mt-3 mb-1.5 font-sans text-base font-semibold text-zinc-100'
            : 'mt-2 mb-1 font-sans text-sm font-semibold text-zinc-200'
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
      parts.push(<Tag key={key++} className={cls}>{renderInline(content)}</Tag>)
      i++
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      parts.push(<hr key={key++} className="my-3 border-zinc-800" />)
      i++
      continue
    }

    // Unordered list
    if (/^[\s]*[-*]\s/.test(line)) {
      const listItems: React.JSX.Element[] = []
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*[-*]\s+/, '')
        listItems.push(<li key={key++}>{renderInline(itemText)}</li>)
        i++
      }
      parts.push(
        <ul key={key++} className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-zinc-600">
          {listItems}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const listItems: React.JSX.Element[] = []
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[\s]*\d+\.\s+/, '')
        listItems.push(<li key={key++}>{renderInline(itemText)}</li>)
        i++
      }
      parts.push(
        <ol key={key++} className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-zinc-500">
          {listItems}
        </ol>
      )
      continue
    }

    // Empty line → paragraph break
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,3}\s/) &&
      !/^[\s]*[-*]\s/.test(lines[i]) &&
      !/^[\s]*\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    parts.push(
      <p key={key++} className="my-1">
        {renderInline(paraLines.join('\n'))}
      </p>
    )
  }

  return parts
}

// --- Sub-components ---

function ToolActionRow({
  tool,
  input
}: {
  tool: string
  input: Record<string, unknown>
}): React.JSX.Element {
  const Icon = getToolIcon(tool)
  const label = getToolLabel(tool)
  const detail = getToolDetail(input)

  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
        <Icon size={14} />
      </div>
      <span className="text-sm text-zinc-400">{label}</span>
      {detail && (
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">{detail}</code>
      )}
    </div>
  )
}

function TextBlock({ content }: { content: string }): React.JSX.Element {
  return <div className="py-1 font-ovo text-base leading-relaxed text-zinc-400">{renderMarkdown(content)}</div>
}

// --- Main component ---

export default function ChatMessage({
  role,
  content,
  toolUses,
  items
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
        <div className="max-w-[75%] rounded-2xl rounded-br-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm text-white shadow-sm">
          <span className="whitespace-pre-wrap">{content}</span>
        </div>
      </div>
    )
  }

  // Assistant — vertical action stream
  const streamItems = items ?? buildItemsFromLegacy(content, toolUses)

  return (
    <div className="px-4 py-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="space-y-0.5">
        {streamItems.map((item, idx) =>
          item.kind === 'tool_use' ? (
            <ToolActionRow key={idx} tool={item.tool} input={item.input} />
          ) : (
            <TextBlock key={idx} content={item.content} />
          )
        )}
      </div>
    </div>
  )
}
