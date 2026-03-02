import { useState, useEffect } from 'react'
import { FilePlus, FolderPlus } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import FileTree from './FileTree'
import EditorTabs from './EditorTabs'
import FileEditor from './FileEditor'

export interface CreatingState {
  type: 'file' | 'folder'
  parentDir: string
}

export default function FilesTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const refreshTree = useFilesStore((s) => s.refreshTree)
  const handleExternalChange = useFilesStore((s) => s.handleExternalChange)
  const closeAllFiles = useFilesStore((s) => s.closeAllFiles)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const [creating, setCreating] = useState<CreatingState | null>(null)

  // Subscribe to file:changed events from chokidar
  useEffect(() => {
    const unsubscribe = window.orchestrate.watchFolder((event) => {
      if (
        event.type === 'add' ||
        event.type === 'unlink' ||
        event.type === 'addDir' ||
        event.type === 'unlinkDir'
      ) {
        refreshTree()
      }

      if (event.type === 'change') {
        handleExternalChange(event.path)
      }
    })

    return unsubscribe
  }, [refreshTree, handleExternalChange])

  // Close all files when folder changes
  useEffect(() => {
    closeAllFiles()
  }, [currentFolder, closeAllFiles])

  function getTargetDir(): string {
    if (!currentFolder) return ''
    if (activeFilePath) {
      const lastSlash = activeFilePath.lastIndexOf('/')
      if (lastSlash > 0) {
        const dir = activeFilePath.slice(0, lastSlash)
        if (dir.startsWith(currentFolder) && dir !== currentFolder) {
          return dir
        }
      }
    }
    return currentFolder
  }

  function handleCreate(type: 'file' | 'folder'): void {
    setCreating({ type, parentDir: getTargetDir() })
  }

  if (!currentFolder) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-zinc-200">No folder selected</p>
          <p className="mt-1 text-sm text-zinc-500">
            Select a project folder to browse and edit files
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: File tree */}
      <div className="flex w-1/4 min-w-[200px] max-w-[400px] flex-col border-r border-zinc-700 bg-zinc-900">
        <div className="flex h-8 items-center border-b border-zinc-700 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <span className="flex-1">Explorer</span>
          <button
            onClick={() => handleCreate('file')}
            className="ml-1 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            title="New File"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={() => handleCreate('folder')}
            className="ml-1 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <FileTree creating={creating} onCreateDone={() => setCreating(null)} />
        </div>
      </div>

      {/* Right panel: Editor */}
      <div className="flex flex-1 flex-col bg-zinc-950">
        <EditorTabs />
        <div className="min-h-0 flex-1">
          <FileEditor />
        </div>
      </div>
    </div>
  )
}
