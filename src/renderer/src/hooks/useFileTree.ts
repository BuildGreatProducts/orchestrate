import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@renderer/stores/app'
import { useFilesStore } from '@renderer/stores/files'
import type { FileEntry } from '@shared/types'

export function useFileTree(): {
  treeData: FileEntry[]
  isLoading: boolean
  error: string | null
  loadChildren: (dirPath: string) => Promise<FileEntry[]>
} {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const treeVersion = useFilesStore((s) => s.treeVersion)
  const [treeData, setTreeData] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTree = useCallback(async () => {
    if (!currentFolder) {
      setTreeData([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const entries = await window.orchestrate.listDirectory(currentFolder)
      setTreeData(entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file tree')
      setTreeData([])
    } finally {
      setIsLoading(false)
    }
  }, [currentFolder])

  useEffect(() => {
    loadTree()
  }, [loadTree, treeVersion])

  const loadChildren = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    try {
      return await window.orchestrate.listDirectory(dirPath)
    } catch {
      return []
    }
  }, [])

  return { treeData, isLoading, error, loadChildren }
}
