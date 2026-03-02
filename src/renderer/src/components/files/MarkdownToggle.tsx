import { Code, Eye } from 'lucide-react'

interface MarkdownToggleProps {
  viewMode: 'raw' | 'pretty'
  onToggle: (mode: 'raw' | 'pretty') => void
}

export default function MarkdownToggle({
  viewMode,
  onToggle
}: MarkdownToggleProps): React.JSX.Element {
  return (
    <div className="absolute right-3 top-2 z-10 flex rounded-lg bg-zinc-900/90 p-0.5 backdrop-blur-sm">
      <button
        onClick={() => onToggle('raw')}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === 'raw' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
        }`}
      >
        <Code size={13} />
        Raw
      </button>
      <button
        onClick={() => onToggle('pretty')}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === 'pretty' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
        }`}
      >
        <Eye size={13} />
        Pretty
      </button>
    </div>
  )
}
