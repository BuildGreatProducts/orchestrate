import { DiffEditor } from '@monaco-editor/react'
import { VscClose } from 'react-icons/vsc'
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60">
      <div className="flex items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4 py-2">
        <span className="truncate text-sm font-medium text-zinc-200">
          {diffModal.filePath}
        </span>
        <button
          onClick={closeDiff}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        >
          <VscClose size={18} />
        </button>
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
