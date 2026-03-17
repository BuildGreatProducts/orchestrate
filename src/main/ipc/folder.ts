import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import path from 'path'
import fs from 'fs'
import { markChannelRegistered } from './stubs'

const store = new Store<{ lastFolder: string | null; projects: string[] }>({
  defaults: { lastFolder: null, projects: [] }
})

export function getCurrentFolder(): string | null {
  return store.get('lastFolder')
}

function addProjectToStore(folderPath: string): string[] {
  const resolved = path.resolve(folderPath)
  const projects = store.get('projects')
  if (!projects.includes(resolved)) {
    projects.push(resolved)
    store.set('projects', projects)
  }
  return projects
}

export function registerFolderHandlers(
  getWindow: () => BrowserWindow | null,
  onFolderChange?: (folder: string) => void
): void {
  markChannelRegistered('folder:select')
  markChannelRegistered('folder:getLast')
  markChannelRegistered('folder:getProjects')
  markChannelRegistered('folder:addProject')
  markChannelRegistered('folder:removeProject')
  markChannelRegistered('folder:setActive')

  ipcMain.handle('folder:select', async () => {
    const win = getWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const folderPath = result.filePaths[0]
    store.set('lastFolder', folderPath)
    addProjectToStore(folderPath)
    onFolderChange?.(folderPath)
    return folderPath
  })

  ipcMain.handle('folder:getLast', () => {
    return store.get('lastFolder')
  })

  ipcMain.handle('folder:getProjects', () => {
    const projects = store.get('projects')
    const existing = projects.filter((p) => fs.existsSync(p))
    if (existing.length !== projects.length) {
      store.set('projects', existing)
    }
    return existing
  })

  ipcMain.handle('folder:addProject', (_event, folderPath: string) => {
    return addProjectToStore(folderPath)
  })

  ipcMain.handle('folder:removeProject', (_event, folderPath: string) => {
    const resolved = path.resolve(folderPath)
    const projects = store.get('projects').filter((p) => p !== resolved)
    store.set('projects', projects)
    if (store.get('lastFolder') === resolved) {
      store.set('lastFolder', null)
    }
    return projects
  })

  ipcMain.handle('folder:setActive', (_event, folderPath: string) => {
    const resolved = path.resolve(folderPath)
    store.set('lastFolder', resolved)
    onFolderChange?.(resolved)
    return resolved
  })
}
