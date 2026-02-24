import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile, unlink, readdir, stat } from 'fs/promises'
import { join, resolve, relative, sep } from 'path'
import { markChannelRegistered } from './stubs'
import type { FileEntry } from '@shared/types'

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  '.Trash',
  'thumbs.db',
  '.next',
  '.nuxt',
  'dist',
  'out',
  '.cache',
  '.turbo'
])

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',
  'svg',
  'mp3',
  'mp4',
  'wav',
  'ogg',
  'webm',
  'mov',
  'avi',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf'
])

function validatePath(filePath: string, projectFolder: string): string {
  const resolved = resolve(projectFolder, filePath)
  const rel = relative(projectFolder, resolved)
  if (rel.startsWith('..') || rel.startsWith(sep)) {
    throw new Error('Path outside project folder')
  }
  return resolved
}

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTENSIONS.has(ext)
}

async function buildFileTree(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const results: FileEntry[] = []

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue
    if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore')
      continue

    const entryPath = join(dirPath, entry.name)
    const isDir = entry.isDirectory()

    results.push({
      name: entry.name,
      path: entryPath,
      isDirectory: isDir,
      children: isDir ? [] : undefined
    })
  }

  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return results
}

export function registerFileHandlers(
  _getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null
): void {
  markChannelRegistered('file:read')
  markChannelRegistered('file:write')
  markChannelRegistered('file:delete')
  markChannelRegistered('file:listDir')

  ipcMain.handle('file:read', async (_, filePath: string) => {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    const absPath = validatePath(filePath, folder)

    if (isBinaryFile(absPath)) {
      throw new Error('Cannot read binary file')
    }

    const stats = await stat(absPath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error('File is too large to open (> 10 MB)')
    }

    return readFile(absPath, 'utf-8')
  })

  ipcMain.handle('file:write', async (_, filePath: string, content: string) => {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    const absPath = validatePath(filePath, folder)
    await writeFile(absPath, content, 'utf-8')
  })

  ipcMain.handle('file:delete', async (_, filePath: string) => {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    const absPath = validatePath(filePath, folder)
    await unlink(absPath)
  })

  ipcMain.handle('file:listDir', async (_, dirPath: string) => {
    const folder = getCurrentFolder()
    if (!folder) throw new Error('No project folder selected')

    const absPath = validatePath(dirPath, folder)
    return buildFileTree(absPath)
  })
}
