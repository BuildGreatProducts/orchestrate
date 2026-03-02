import { useState, useCallback, useEffect, useRef } from 'react'
import { VscChevronRight, VscChevronDown, VscFolder, VscFolderOpened, VscFile } from 'react-icons/vsc'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useHistoryStore } from '@renderer/stores/history'
import { useFileTree } from '@renderer/hooks/useFileTree'
import type { FileEntry } from '@shared/types'
import type { CreatingState } from './FilesTab'

const STATUS_COLORS: Record<string, string> = {
  M: 'text-amber-400',
  A: 'text-green-400',
  D: 'text-red-400',
  '?': 'text-zinc-500'
}

function InlineCreateInput({
  type,
  depth,
  parentDir,
  onDone
}: {
  type: 'file' | 'folder'
  depth: number
  parentDir: string
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const createFile = useFilesStore((s) => s.createFile)
  const createFolder = useFilesStore((s) => s.createFolder)
  const doneRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function finish(): void {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  async function handleSubmit(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      finish()
      return
    }
    if (type === 'file') {
      await createFile(parentDir, trimmed)
    } else {
      await createFolder(parentDir, trimmed)
    }
    finish()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish()
    }
  }

  const Icon = type === 'folder' ? VscFolder : VscFile

  return (
    <div
      style={{ paddingLeft: depth * 16 + 8 }}
      className="flex items-center gap-1 py-0.5 pr-2"
    >
      <span className="flex w-4 shrink-0 items-center justify-center" />
      <Icon className="shrink-0 text-zinc-500" size={16} />
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => finish()}
        className="min-w-0 flex-1 bg-zinc-800 px-1 text-sm text-zinc-200 outline-none ring-1 ring-zinc-600 focus:ring-blue-500"
        placeholder={type === 'file' ? 'filename' : 'folder name'}
      />
    </div>
  )
}

function FileNode({
  entry,
  depth,
  loadChildren,
  treeVersion,
  fileStatusMap,
  currentFolder,
  creating,
  onCreateDone
}: {
  entry: FileEntry
  depth: number
  loadChildren: (dirPath: string) => Promise<FileEntry[]>
  treeVersion: number
  fileStatusMap: Record<string, 'M' | 'A' | 'D' | '?'>
  currentFolder: string
  creating: CreatingState | null
  onCreateDone: () => void
}): React.JSX.Element {
  const openFile = useFilesStore((s) => s.openFile)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const [isOpen, setIsOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const isActive = !entry.isDirectory && entry.path === activeFilePath
  const isCreateTarget = creating !== null && entry.isDirectory && entry.path === creating.parentDir

  // Auto-expand directory when it's the target for creation
  useEffect(() => {
    if (isCreateTarget && !isOpen) {
      setIsOpen(true)
      if (children === null) {
        loadChildren(entry.path).then(setChildren)
      }
    }
  }, [isCreateTarget]) // eslint-disable-line react-hooks/exhaustive-deps

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
    relativePath.length > 0 &&
    Object.keys(fileStatusMap).some((key) => key.startsWith(relativePath + '/'))

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
          {isCreateTarget && creating && (
            <InlineCreateInput
              type={creating.type}
              depth={depth + 1}
              parentDir={creating.parentDir}
              onDone={onCreateDone}
            />
          )}
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
              creating={creating}
              onCreateDone={onCreateDone}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function FileTree({
  creating,
  onCreateDone
}: {
  creating: CreatingState | null
  onCreateDone: () => void
}): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const treeVersion = useFilesStore((s) => s.treeVersion)
  const fileStatusMap = useHistoryStore((s) => s.fileStatusMap)
  const { treeData, isLoading, error, loadChildren } = useFileTree()

  const isRootTarget = creating !== null && currentFolder !== null && creating.parentDir === currentFolder

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

  if (treeData.length === 0 && !isRootTarget) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        No files found
      </div>
    )
  }

  return (
    <div role="tree" className="h-full overflow-y-auto">
      {isRootTarget && creating && (
        <InlineCreateInput
          type={creating.type}
          depth={0}
          parentDir={creating.parentDir}
          onDone={onCreateDone}
        />
      )}
      {treeData.map((entry) => (
        <FileNode
          key={entry.path}
          entry={entry}
          depth={0}
          loadChildren={loadChildren}
          treeVersion={treeVersion}
          fileStatusMap={fileStatusMap}
          currentFolder={currentFolder}
          creating={creating}
          onCreateDone={onCreateDone}
        />
      ))}
    </div>
  )
}
