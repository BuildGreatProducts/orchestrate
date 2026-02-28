import { create } from 'zustand'
import { toast } from './toast'

interface OpenFile {
  path: string
  name: string
  content: string
  savedContent: string
  language: string
}

interface FilesState {
  openFiles: OpenFile[]
  activeFilePath: string | null
  treeVersion: number
  /** Paths currently shown in markdown preview mode */
  markdownPreviewPaths: Record<string, boolean>

  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  updateContent: (path: string, content: string) => void
  saveFile: (path: string) => Promise<void>
  saveActiveFile: () => Promise<void>
  refreshTree: () => void
  closeAllFiles: () => void
  handleExternalChange: (path: string) => Promise<void>
  toggleMarkdownPreview: (path: string) => void
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  svg: 'xml',
  xml: 'xml',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  r: 'r',
  lua: 'lua',
  dart: 'dart',
  vue: 'html',
  dockerfile: 'dockerfile'
}

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile') return 'makefile'
  const ext = lower.split('.').pop() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

export const useFilesStore = create<FilesState>((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  treeVersion: 0,
  markdownPreviewPaths: {},

  openFile: async (path: string) => {
    const { openFiles } = get()

    const existing = openFiles.find((f) => f.path === path)
    if (existing) {
      set({ activeFilePath: path })
      return
    }

    let content: string
    try {
      content = await window.orchestrate.readFile(path)
    } catch (err) {
      toast.error(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    const name = path.split('/').pop() ?? path

    set((state) => ({
      openFiles: [
        ...state.openFiles,
        {
          path,
          name,
          content,
          savedContent: content,
          language: detectLanguage(name)
        }
      ],
      activeFilePath: path
    }))
  },

  closeFile: (path: string) => {
    set((state) => {
      const newFiles = state.openFiles.filter((f) => f.path !== path)
      let newActive = state.activeFilePath

      if (state.activeFilePath === path) {
        const closedIndex = state.openFiles.findIndex((f) => f.path === path)
        newActive = newFiles[closedIndex - 1]?.path ?? newFiles[closedIndex]?.path ?? null
      }

      const { [path]: _removed, ...remainingPreviews } = state.markdownPreviewPaths
      void _removed
      return {
        openFiles: newFiles,
        activeFilePath: newActive,
        markdownPreviewPaths: remainingPreviews
      }
    })
  },

  setActiveFile: (path: string) => set({ activeFilePath: path }),

  updateContent: (path: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) => (f.path === path ? { ...f, content } : f))
    }))
  },

  saveFile: async (path: string) => {
    const file = get().openFiles.find((f) => f.path === path)
    if (!file) return

    try {
      await window.orchestrate.writeFile(path, file.content)
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === path ? { ...f, savedContent: f.content } : f
        )
      }))
      toast.success('File saved')
    } catch (err) {
      toast.error(`Failed to save file: ${err instanceof Error ? err.message : String(err)}`)
    }
  },

  saveActiveFile: async () => {
    const { activeFilePath, saveFile } = get()
    if (activeFilePath) await saveFile(activeFilePath)
  },

  refreshTree: () => {
    set((state) => ({ treeVersion: state.treeVersion + 1 }))
  },

  closeAllFiles: () => {
    set({ openFiles: [], activeFilePath: null, markdownPreviewPaths: {} })
  },

  handleExternalChange: async (changedPath: string) => {
    const file = get().openFiles.find((f) => f.path === changedPath)
    if (!file) return

    const isDirty = file.content !== file.savedContent
    if (!isDirty) {
      try {
        const newContent = await window.orchestrate.readFile(changedPath)
        set((state) => ({
          openFiles: state.openFiles.map((f) =>
            f.path === changedPath ? { ...f, content: newContent, savedContent: newContent } : f
          )
        }))
      } catch {
        // File may have been deleted — ignore
      }
    }
  },

  toggleMarkdownPreview: (path: string) => {
    set((state) => ({
      markdownPreviewPaths: {
        ...state.markdownPreviewPaths,
        [path]: !state.markdownPreviewPaths[path]
      }
    }))
  }
}))
