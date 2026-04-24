import { useEffect, useRef, useState } from 'react'
import * as monaco from '@monaco-editor/react'

interface FileVersion {
  content: string
  label: string
}

interface MonacoDiffViewerProps {
  original: FileVersion
  modified: FileVersion
  language?: string
}

export function MonacoDiffViewer({ original, modified, language = 'plaintext' }: MonacoDiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mounted) return

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
    })

    const originalModel = monaco.editor.createModel(original.content, language)
    const modifiedModel = monaco.editor.createModel(modified.content, language)

    editor.setModel({
      original: originalModel,
      modified: modifiedModel,
    })

    editorRef.current = editor
    setMounted(true)

    return () => {
      originalModel.dispose()
      modifiedModel.dispose()
      editor.dispose()
    }
  }, [original.content, modified.content, language, mounted])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Diff Viewer</span>
        <span className="text-xs text-muted-foreground">
          {original.label} → {modified.label}
        </span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}