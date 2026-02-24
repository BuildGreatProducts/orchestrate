import { useRef, useState, useEffect, useCallback } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'
import { VscFolder, VscFolderOpened, VscFile } from 'react-icons/vsc'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import { useFileTree } from '@renderer/hooks/useFileTree'
import type { FileEntry } from '@shared/types'

interface TreeNode {
  id: string
  name: string
  isDirectory: boolean
  children?: TreeNode[]
}

function fileEntriesToNodes(entries: FileEntry[]): TreeNode[] {
  return entries.map((entry) => ({
    id: entry.path,
    name: entry.name,
    isDirectory: entry.isDirectory,
    children: entry.isDirectory ? [] : undefined
  }))
}

function mergeChildren(
  nodes: TreeNode[],
  parentId: string,
  children: TreeNode[]
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: mergeChildren(node.children, parentId, children) }
    }
    return node
  })
}

function Node({ node, style }: NodeRendererProps<TreeNode>): React.JSX.Element {
  const openFile = useFilesStore((s) => s.openFile)
  const activeFilePath = useFilesStore((s) => s.activeFilePath)
  const isActive = !node.data.isDirectory && node.data.id === activeFilePath

  const handleClick = (): void => {
    if (node.data.isDirectory) {
      node.toggle()
    } else {
      openFile(node.data.id)
    }
  }

  const Icon = node.data.isDirectory ? (node.isOpen ? VscFolderOpened : VscFolder) : VscFile

  return (
    <div
      style={style}
      onClick={handleClick}
      className={`flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-sm ${
        isActive ? 'bg-zinc-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      <Icon className="shrink-0 text-zinc-500" size={16} />
      <span className="truncate">{node.data.name}</span>
    </div>
  )
}

export default function FileTree(): React.JSX.Element {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const { treeData, isLoading, loadChildren } = useFileTree()
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(400)
  const [nodes, setNodes] = useState<TreeNode[]>([])

  // Update nodes when treeData changes (from IPC)
  useEffect(() => {
    setNodes(fileEntriesToNodes(treeData))
  }, [treeData])

  // Measure container height for react-arborist virtualization
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height)
      }
    })

    observer.observe(el)
    setHeight(el.clientHeight)

    return () => observer.disconnect()
  }, [])

  const handleToggle = useCallback(
    (id: string): void => {
      // Load children when a directory is toggled open
      loadChildren(id).then((children) => {
        if (children.length > 0) {
          const childNodes = fileEntriesToNodes(children)
          setNodes((prev) => mergeChildren(prev, id, childNodes))
        }
      })
    },
    [loadChildren]
  )

  if (!currentFolder) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Select a folder to browse files
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Loading...
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <Tree<TreeNode>
        data={nodes}
        openByDefault={false}
        width={'100%'}
        height={height}
        indent={16}
        rowHeight={28}
        onToggle={handleToggle}
      >
        {Node}
      </Tree>
    </div>
  )
}
