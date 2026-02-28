import Editor, { type OnMount } from '@monaco-editor/react'
import { useFilesStore } from '@renderer/stores/files'
import { useRef } from 'react'
import type { editor } from 'monaco-editor'
import { VscOpenPreview, VscCode } from 'react-icons/vsc'
import MarkdownPreview from './MarkdownPreview'

export default function FileEditor(): React.JSX.Element {
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const openFiles = useFilesStore((s) => s.openFiles)
  const updateContent = useFilesStore((s) => s.updateContent)
  const saveActiveFile = useFilesStore((s) => s.saveActiveFile)
  const markdownPreviewPaths = useFilesStore((s) => s.markdownPreviewPaths)
  const toggleMarkdownPreview = useFilesStore((s) => s.toggleMarkdownPreview)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance

    editorInstance.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        saveActiveFile()
      }
    })
  }

  if (!activeFile) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center">
          <p className="text-lg">No file open</p>
          <p className="mt-1 text-sm">Click a file in the tree to open it</p>
        </div>
      </div>
    )
  }

  const isMarkdown = activeFile.language === 'markdown'
  const isPreviewing = isMarkdown && !!markdownPreviewPaths[activeFile.path]

  return (
    <div className="flex h-full flex-col">
      {isMarkdown && (
        <div className="flex h-8 items-center justify-end border-b border-zinc-700/50 bg-zinc-900/50 px-2">
          <button
            onClick={() => toggleMarkdownPreview(activeFile.path)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            title={isPreviewing ? 'Show raw markdown' : 'Show rendered preview'}
          >
            {isPreviewing ? (
              <>
                <VscCode size={14} />
                <span>Raw</span>
              </>
            ) : (
              <>
                <VscOpenPreview size={14} />
                <span>Preview</span>
              </>
            )}
          </button>
        </div>
      )}
      <div className="flex-1">
        {isPreviewing ? (
          <MarkdownPreview content={activeFile.content} />
        ) : (
          <Editor
            key={activeFile.path}
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            theme="vs-dark"
            onChange={(value) => {
              if (value !== undefined) {
                updateContent(activeFile.path, value)
              }
            }}
            onMount={handleEditorMount}
            options={{
              fontSize: 13,
              fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              tabSize: 2,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 12 }
            }}
          />
        )}
      </div>
    </div>
  )
}
