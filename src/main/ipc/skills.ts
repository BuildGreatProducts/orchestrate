import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { markChannelRegistered } from './stubs'
import { SkillManager, GLOBAL_SKILLS_DIR, getProjectSkillsDir } from '../skill-manager'

export function registerSkillHandlers(
  getWindow: () => BrowserWindow | null,
  getCurrentFolder: () => string | null,
  getSkillManager: () => SkillManager
): void {
  markChannelRegistered('skill:list')
  markChannelRegistered('skill:addFromFolder')
  markChannelRegistered('skill:addFromZip')
  markChannelRegistered('skill:addFromGit')
  markChannelRegistered('skill:remove')
  markChannelRegistered('skill:setEnabled')
  markChannelRegistered('skill:getContent')
  markChannelRegistered('skill:openFolder')

  ipcMain.handle('skill:list', async () => {
    const mgr = getSkillManager()
    const folder = getCurrentFolder()
    return mgr.discoverSkills(folder || undefined)
  })

  ipcMain.handle(
    'skill:addFromFolder',
    async (_, sourcePath: string, target: 'global' | 'project') => {
      const mgr = getSkillManager()

      // If no sourcePath provided, open a folder picker
      let selectedPath = sourcePath
      if (!selectedPath) {
        const win = getWindow()
        const result = await dialog.showOpenDialog(win!, {
          properties: ['openDirectory'],
          title: 'Select Skill Folder'
        })
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('No folder selected')
        }
        selectedPath = result.filePaths[0]
      }

      const folder = getCurrentFolder()
      return mgr.importFromFolder(selectedPath, target, folder || undefined)
    }
  )

  ipcMain.handle('skill:addFromZip', async (_, zipPath: string, target: 'global' | 'project') => {
    const mgr = getSkillManager()

    let selectedPath = zipPath
    if (!selectedPath) {
      const win = getWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'Zip Archives', extensions: ['zip'] }],
        title: 'Select Skill Zip File'
      })
      if (result.canceled || result.filePaths.length === 0) {
        throw new Error('No file selected')
      }
      selectedPath = result.filePaths[0]
    }

    const folder = getCurrentFolder()
    return mgr.importFromZip(selectedPath, target, folder || undefined)
  })

  ipcMain.handle('skill:addFromGit', async (_, repoUrl: string, target: 'global' | 'project') => {
    const mgr = getSkillManager()
    if (!repoUrl || typeof repoUrl !== 'string') {
      throw new Error('Repository URL is required')
    }
    const folder = getCurrentFolder()
    return mgr.importFromGit(repoUrl, target, folder || undefined)
  })

  async function validateSkillPath(mgr: SkillManager, skillPath: string): Promise<void> {
    const folder = getCurrentFolder()
    const skills = await mgr.discoverSkills(folder || undefined)
    if (!skills.some((s) => s.path === skillPath)) {
      throw new Error('Unknown skill path')
    }
  }

  ipcMain.handle('skill:remove', async (_, skillPath: string) => {
    const mgr = getSkillManager()
    await validateSkillPath(mgr, skillPath)
    await mgr.removeSkill(skillPath)
  })

  ipcMain.handle('skill:setEnabled', async (_, skillPath: string, enabled: boolean) => {
    const mgr = getSkillManager()
    await validateSkillPath(mgr, skillPath)
    mgr.setSkillEnabled(skillPath, enabled)
  })

  ipcMain.handle('skill:getContent', async (_, skillPath: string) => {
    const mgr = getSkillManager()
    await validateSkillPath(mgr, skillPath)
    return mgr.getSkillContent(skillPath)
  })

  ipcMain.handle('skill:openFolder', async (_, target: 'global' | 'project') => {
    if (target === 'project') {
      const folder = getCurrentFolder()
      if (!folder) throw new Error('No project folder selected')
      await shell.openPath(getProjectSkillsDir(folder))
    } else {
      await shell.openPath(GLOBAL_SKILLS_DIR)
    }
  })
}
