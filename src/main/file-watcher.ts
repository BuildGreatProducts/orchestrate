import { watch, type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import path from 'path'
import type { FileChangeEvent } from '@shared/types'

let watcher: FSWatcher | null = null

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  '.cache',
  '.turbo'
])

function isIgnored(filePath: string): boolean {
  const basename = path.basename(filePath)
  if (basename === '.DS_Store') return true
  return IGNORED_DIRS.has(basename)
}

export function startWatching(
  folderPath: string,
  getWindow: () => BrowserWindow | null
): void {
  stopWatching()

  watcher = watch(folderPath, {
    ignored: isIgnored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    },
    depth: 20
  })

  const sendEvent = (type: FileChangeEvent['type'], path: string): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('file:changed', { type, path })
    }
  }

  watcher
    .on('add', (path) => sendEvent('add', path))
    .on('change', (path) => sendEvent('change', path))
    .on('unlink', (path) => sendEvent('unlink', path))
    .on('addDir', (path) => sendEvent('addDir', path))
    .on('unlinkDir', (path) => sendEvent('unlinkDir', path))
    .on('error', (error) => {
      console.error('[FileWatcher] Error:', error)
    })
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
