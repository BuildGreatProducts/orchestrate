import { DiffEditor } from '@monaco-editor/react'
import { VscArrowLeft } from 'react-icons/vsc'
import { useHistoryStore } from '@renderer/stores/history'

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp'
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

export default function DiffViewer(): React.JSX.Element | null {
  const diffModal = useHistoryStore((s) => s.diffModal)
  const closeDiff = useHistoryStore((s) => s.closeDiff)

  if (!diffModal) return null

  const language = detectLanguage(diffModal.filePath)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <button
          onClick={closeDiff}
          aria-label="Close diff"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        >
          <VscArrowLeft size={16} />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
          {diffModal.filePath}
        </span>
        <span className="flex-none text-xs text-zinc-600">
          {diffModal.hash.slice(0, 7)}
        </span>
      </div>
      <div className="flex-1">
        <DiffEditor
          original={diffModal.before}
          modified={diffModal.after}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false
          }}
        />
      </div>
    </div>
  )
}
