import type { FileDiff } from '@shared/types'

const STATUS_COLORS: Record<string, string> = {
  M: 'text-amber-400',
  A: 'text-green-400',
  D: 'text-red-400',
  R: 'text-blue-400'
}

export default function FileChangeList({
  files,
  onViewDiff
}: {
  files: FileDiff[]
  onViewDiff: (filePath: string) => void
}): React.JSX.Element {
  return (
    <div className="border-t border-zinc-800 py-2">
      {files.map((file) => (
        <button
          key={file.path}
          onClick={() => onViewDiff(file.path)}
          className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-zinc-800"
        >
          <span
            className={`w-4 shrink-0 text-center font-mono text-xs font-bold ${STATUS_COLORS[file.status] ?? 'text-zinc-500'}`}
          >
            {file.status}
          </span>
          <span className="min-w-0 flex-1 truncate text-zinc-300">{file.path}</span>
          <span className="shrink-0 font-mono text-xs">
            {file.insertions > 0 && <span className="text-green-400">+{file.insertions}</span>}
            {file.insertions > 0 && file.deletions > 0 && <span className="text-zinc-600"> </span>}
            {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
