import { VscClose, VscCircleFilled } from 'react-icons/vsc'
import { useFilesStore } from '@renderer/stores/files'

export default function EditorTabs(): React.JSX.Element | null {
  const openFiles = useFilesStore((s) => s.openFiles)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const closeFile = useFilesStore((s) => s.closeFile)

  if (openFiles.length === 0) return null

  return (
    <div className="flex h-9 items-center gap-0 overflow-x-auto border-b border-zinc-700 bg-zinc-900">
      {openFiles.map((file) => {
        const isActive = file.path === activeFilePath
        const isDirty = file.content !== file.savedContent

        return (
          <button
            key={file.path}
            onClick={() => setActiveFile(file.path)}
            className={`group flex h-full items-center gap-1.5 border-r border-zinc-700 px-3 text-sm ${
              isActive
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {isDirty && <VscCircleFilled className="shrink-0 text-amber-400" size={8} />}
            <span className="max-w-[120px] truncate">{file.name}</span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.path)
              }}
              className="ml-1 shrink-0 rounded p-0.5 opacity-0 hover:bg-zinc-600 group-hover:opacity-100"
            >
              <VscClose size={14} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
