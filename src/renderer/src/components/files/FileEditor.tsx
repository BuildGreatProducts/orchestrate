import Editor, { type OnMount } from '@monaco-editor/react'
import { useFilesStore } from '@renderer/stores/files'
import { useRef } from 'react'
import type { editor } from 'monaco-editor'
import MarkdownPreview from './MarkdownPreview'
import MarkdownToggle from './MarkdownToggle'

export default function FileEditor(): React.JSX.Element {
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const openFiles = useFilesStore((s) => s.openFiles)
  const updateContent = useFilesStore((s) => s.updateContent)
  const saveActiveFile = useFilesStore((s) => s.saveActiveFile)
  const setViewMode = useFilesStore((s) => s.setViewMode)
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
  const viewMode = activeFile.viewMode ?? 'raw'

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {isMarkdown && (
        <MarkdownToggle
          viewMode={viewMode}
          onToggle={(mode) => setViewMode(activeFile.path, mode)}
        />
      )}
      {isMarkdown && viewMode === 'pretty' ? (
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
  )
}
