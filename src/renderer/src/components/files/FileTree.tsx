import { useState, useCallback } from 'react'
import { VscChevronRight, VscChevronDown, VscFolder, VscFolderOpened, VscFile } from 'react-icons/vsc'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useFileTree } from '@renderer/hooks/useFileTree'
import type { FileEntry } from '@shared/types'

function FileNode({
  entry,
  depth,
  loadChildren
}: {
  entry: FileEntry
  depth: number
  loadChildren: (dirPath: string) => Promise<FileEntry[]>
}): React.JSX.Element {
  const openFile = useFilesStore((s) => s.openFile)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const [isOpen, setIsOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const isActive = !entry.isDirectory && entry.path === activeFilePath

  const handleClick = useCallback(async () => {
    if (entry.isDirectory) {
      const opening = !isOpen
      setIsOpen(opening)
      if (opening && children === null) {
        setLoading(true)
        const loaded = await loadChildren(entry.path)
        setChildren(loaded)
        setLoading(false)
      }
    } else {
      openFile(entry.path)
    }
  }, [entry, isOpen, children, loadChildren, openFile])

  const Chevron = entry.isDirectory
    ? isOpen
      ? VscChevronDown
      : VscChevronRight
    : null

  const FileIcon = entry.isDirectory ? (isOpen ? VscFolderOpened : VscFolder) : VscFile

  return (
    <>
      <div
        onClick={handleClick}
        style={{ paddingLeft: depth * 16 + 8 }}
        className={`flex cursor-pointer items-center gap-1 py-0.5 pr-2 text-sm ${
          isActive ? 'bg-zinc-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <span className="flex w-4 shrink-0 items-center justify-center">
          {Chevron ? <Chevron size={16} className="text-zinc-500" /> : null}
        </span>
        <FileIcon className="shrink-0 text-zinc-500" size={16} />
        <span className="truncate">{entry.name}</span>
      </div>
      {isOpen && entry.isDirectory && (
        <div>
          {loading && (
            <div
              style={{ paddingLeft: (depth + 1) * 16 + 8 }}
              className="py-0.5 text-xs text-zinc-600"
            >
              Loading...
            </div>
          )}
          {children?.map((child) => (
            <FileNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              loadChildren={loadChildren}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function FileTree(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const { treeData, isLoading, error, loadChildren } = useFileTree()

  if (!currentFolder) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Select a folder to browse files
      </div>
    )
  }

  if (isLoading && treeData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (treeData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        No files found
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {treeData.map((entry) => (
        <FileNode key={entry.path} entry={entry} depth={0} loadChildren={loadChildren} />
      ))}
    </div>
  )
}
