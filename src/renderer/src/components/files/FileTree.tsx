import { useState, useCallback, useEffect, useRef } from 'react'
import { VscChevronRight, VscChevronDown, VscFolder, VscFolderOpened, VscFile } from 'react-icons/vsc'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useHistoryStore } from '@renderer/stores/history'
import { useFileTree } from '@renderer/hooks/useFileTree'
import type { FileEntry } from '@shared/types'

const STATUS_COLORS: Record<string, string> = {
  M: 'text-amber-400',
  A: 'text-green-400',
  D: 'text-red-400',
  '?': 'text-zinc-500'
}

function FileNode({
  entry,
  depth,
  loadChildren,
  treeVersion,
  fileStatusMap,
  currentFolder
}: {
  entry: FileEntry
  depth: number
  loadChildren: (dirPath: string) => Promise<FileEntry[]>
  treeVersion: number
  fileStatusMap: Record<string, 'M' | 'A' | 'D' | '?'>
  currentFolder: string
}): React.JSX.Element {
  const openFile = useFilesStore((s) => s.openFile)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const [isOpen, setIsOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const isActive = !entry.isDirectory && entry.path === activeFilePath

  // Invalidate cached children when the tree is refreshed externally
  const prevTreeVersionRef = useRef(treeVersion)
  useEffect(() => {
    if (prevTreeVersionRef.current !== treeVersion) {
      prevTreeVersionRef.current = treeVersion
      setChildren(null)
    }
  }, [treeVersion])

  const handleClick = useCallback(async () => {
    if (entry.isDirectory) {
      const opening = !isOpen
      setIsOpen(opening)
      if (opening && children === null) {
        setLoading(true)
        try {
          const loaded = await loadChildren(entry.path)
          setChildren(loaded)
        } finally {
          setLoading(false)
        }
      }
    } else {
      openFile(entry.path)
    }
  }, [entry, isOpen, children, loadChildren, openFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  const Chevron = entry.isDirectory
    ? isOpen
      ? VscChevronDown
      : VscChevronRight
    : null

  const FileIcon = entry.isDirectory ? (isOpen ? VscFolderOpened : VscFolder) : VscFile

  // Derive relative path for git status lookup
  const relativePath = entry.path.startsWith(currentFolder)
    ? entry.path.slice(currentFolder.length).replace(/^\//, '')
    : entry.name

  const fileStatus = entry.isDirectory ? undefined : fileStatusMap[relativePath]

  // For directories, show a dot if any descendant has status
  const dirHasStatus =
    entry.isDirectory &&
    Object.keys(fileStatusMap).some((key) => key.startsWith(relativePath + '/') || key === relativePath)

  return (
    <>
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isActive}
        aria-expanded={entry.isDirectory ? isOpen : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
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
        {fileStatus && (
          <span className={`ml-auto shrink-0 font-mono text-xs font-bold ${STATUS_COLORS[fileStatus] ?? ''}`}>
            {fileStatus}
          </span>
        )}
        {!fileStatus && dirHasStatus && (
          <span className="ml-auto shrink-0 text-amber-400">&bull;</span>
        )}
      </div>
      {isOpen && entry.isDirectory && (
        <div role="group">
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
              treeVersion={treeVersion}
              fileStatusMap={fileStatusMap}
              currentFolder={currentFolder}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function FileTree(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const treeVersion = useFilesStore((s) => s.treeVersion)
  const fileStatusMap = useHistoryStore((s) => s.fileStatusMap)
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
    <div role="tree" className="h-full overflow-y-auto">
      {treeData.map((entry) => (
        <FileNode
          key={entry.path}
          entry={entry}
          depth={0}
          loadChildren={loadChildren}
          treeVersion={treeVersion}
          fileStatusMap={fileStatusMap}
          currentFolder={currentFolder}
        />
      ))}
    </div>
  )
}
