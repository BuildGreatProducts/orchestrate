import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import FileTree from './FileTree'
import EditorTabs from './EditorTabs'
import FileEditor from './FileEditor'

export default function FilesTab(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const refreshTree = useFilesStore((s) => s.refreshTree)
  const handleExternalChange = useFilesStore((s) => s.handleExternalChange)
  const closeAllFiles = useFilesStore((s) => s.closeAllFiles)

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
          Explorer
        </div>
        <div className="flex-1 overflow-hidden">
          <FileTree />
        </div>
      </div>

      {/* Right panel: Editor */}
      <div className="flex flex-1 flex-col bg-zinc-950">
        <EditorTabs />
        <div className="flex-1">
          <FileEditor />
        </div>
      </div>
    </div>
  )
}
