import { ipcMain } from 'electron'
import Store from 'electron-store'
import { v4 as uuidv4 } from 'nanoid'

interface TerminalTab {
  id: string
  title: string
  cwd: string
  activeProject: string | null
}

const store = new Store<{ terminalTabs: TerminalTab[] }>({
  name: 'terminal-tabs',
  defaults: {
    terminalTabs: [],
  },
})

export function setupTerminalTabsIPC(): void {
  ipcMain.handle('terminal:get-tabs', () => {
    return store.get('terminalTabs')
  })

  ipcMain.handle('terminal:save-tabs', (_event, tabs: TerminalTab[]) => {
    store.set('terminalTabs', tabs)
  })

  ipcMain.handle('terminal:create-tab', (_event, cwd?: string) => {
    const tabs = store.get('terminalTabs')
    const newTab: TerminalTab = {
      id: uuidv4(),
      title: `Terminal ${tabs.length + 1}`,
      cwd: cwd || '',
      activeProject: null,
    }
    store.set('terminalTabs', [...tabs, newTab])
    return newTab
  })

  ipcMain.handle('terminal:update-tab', (_event, id: string, updates: Partial<TerminalTab>) => {
    const tabs = store.get('terminalTabs')
    const index = tabs.findIndex(t => t.id === id)
    if (index >= 0) {
      tabs[index] = { ...tabs[index], ...updates }
      store.set('terminalTabs', tabs)
    }
    return tabs[index]
  })

  ipcMain.handle('terminal:delete-tab', (_event, id: string) => {
    const tabs = store.get('terminalTabs')
    store.set('terminalTabs', tabs.filter(t => t.id !== id))
  })
}