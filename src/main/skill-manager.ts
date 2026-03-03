import { readFile, readdir, stat, cp, mkdir, rm } from 'fs/promises'
import { join, basename } from 'path'
import { homedir, tmpdir } from 'os'
import matter from 'gray-matter'
import Store from 'electron-store'
import simpleGit from 'simple-git'
import type { SkillMeta } from '@shared/types'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const GLOBAL_SKILLS_DIR = join(homedir(), '.orchestrate', 'skills')

export function getProjectSkillsDir(projectFolder: string): string {
  return join(projectFolder, '.skills')
}

export class SkillManager {
  private store: Store

  constructor(store: Store) {
    this.store = store
  }

  async ensureGlobalDir(): Promise<void> {
    await mkdir(GLOBAL_SKILLS_DIR, { recursive: true })
  }

  async discoverSkills(projectFolder?: string): Promise<SkillMeta[]> {
    const skills: SkillMeta[] = []
    const disabledPaths = (this.store.get('skillsDisabled') as string[]) || []

    // Scan global skills
    const globalSkills = await this.scanDirectory(GLOBAL_SKILLS_DIR, 'global')
    skills.push(...globalSkills)

    // Scan project skills
    if (projectFolder) {
      const projectDir = getProjectSkillsDir(projectFolder)
      const projectSkills = await this.scanDirectory(projectDir, 'project')
      skills.push(...projectSkills)
    }

    // Apply enabled/disabled state
    for (const skill of skills) {
      skill.enabled = !disabledPaths.includes(skill.path)
    }

    return skills
  }

  private async scanDirectory(dir: string, source: 'global' | 'project'): Promise<SkillMeta[]> {
    const skills: SkillMeta[] = []
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return skills
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry)
      try {
        const entryStat = await stat(entryPath)
        if (!entryStat.isDirectory()) continue

        const skillMdPath = join(entryPath, 'SKILL.md')
        try {
          await stat(skillMdPath)
        } catch {
          continue // No SKILL.md, skip
        }

        const meta = await this.parseSkillMd(skillMdPath, entryPath, source)
        if (meta) skills.push(meta)
      } catch {
        // Skip entries we can't read
      }
    }

    return skills
  }

  async parseSkillMd(
    filePath: string,
    skillDir: string,
    source: 'global' | 'project'
  ): Promise<SkillMeta | null> {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const { data } = matter(raw)

      const name = data.name || basename(skillDir)
      const description = data.description || ''

      return {
        name,
        description,
        path: skillDir,
        source,
        enabled: true,
        license: data.license,
        compatibility: data.compatibility,
        metadata: data.metadata
      }
    } catch {
      return null
    }
  }

  async getSkillContent(skillPath: string): Promise<string> {
    const skillMdPath = join(skillPath, 'SKILL.md')
    const raw = await readFile(skillMdPath, 'utf-8')
    const { content } = matter(raw)
    return content.trim()
  }

  async importFromFolder(
    sourcePath: string,
    target: 'global' | 'project',
    projectFolder?: string
  ): Promise<SkillMeta> {
    // Validate SKILL.md exists
    const skillMdPath = join(sourcePath, 'SKILL.md')
    try {
      await stat(skillMdPath)
    } catch {
      throw new Error('Selected folder does not contain a SKILL.md file')
    }

    const destDir = target === 'global' ? GLOBAL_SKILLS_DIR : getProjectSkillsDir(projectFolder!)
    await mkdir(destDir, { recursive: true })

    const folderName = basename(sourcePath)
    const destPath = join(destDir, folderName)

    await cp(sourcePath, destPath, { recursive: true })

    const meta = await this.parseSkillMd(join(destPath, 'SKILL.md'), destPath, target)
    if (!meta) throw new Error('Failed to parse SKILL.md after import')
    return meta
  }

  async importFromZip(
    zipPath: string,
    target: 'global' | 'project',
    projectFolder?: string
  ): Promise<SkillMeta> {
    // Extract to temp directory first
    const tempDir = join(tmpdir(), `orchestrate-skill-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    try {
      // Use system unzip command
      await execFileAsync('unzip', ['-o', zipPath, '-d', tempDir])

      // Find the directory containing SKILL.md
      const skillDir = await this.findSkillRoot(tempDir)
      if (!skillDir) {
        throw new Error('Zip archive does not contain a SKILL.md file')
      }

      return await this.importFromFolder(skillDir, target, projectFolder)
    } finally {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async importFromGit(
    repoUrl: string,
    target: 'global' | 'project',
    projectFolder?: string
  ): Promise<SkillMeta> {
    const destDir = target === 'global' ? GLOBAL_SKILLS_DIR : getProjectSkillsDir(projectFolder!)
    await mkdir(destDir, { recursive: true })

    // Extract repo name from URL
    const repoName = basename(repoUrl, '.git')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase()
    const destPath = join(destDir, repoName)

    const git = simpleGit()
    await git.clone(repoUrl, destPath, ['--depth', '1'])

    // Check if SKILL.md exists at root or find it
    const skillRoot = await this.findSkillRoot(destPath)
    if (!skillRoot) {
      await rm(destPath, { recursive: true, force: true }).catch(() => {})
      throw new Error('Cloned repository does not contain a SKILL.md file')
    }

    // If SKILL.md is in a subdirectory, move it up
    if (skillRoot !== destPath) {
      const finalPath = join(destDir, basename(skillRoot))
      if (finalPath !== destPath) {
        await cp(skillRoot, finalPath, { recursive: true })
        await rm(destPath, { recursive: true, force: true }).catch(() => {})
        const meta = await this.parseSkillMd(join(finalPath, 'SKILL.md'), finalPath, target)
        if (!meta) throw new Error('Failed to parse SKILL.md after clone')
        return meta
      }
    }

    const meta = await this.parseSkillMd(join(destPath, 'SKILL.md'), destPath, target)
    if (!meta) throw new Error('Failed to parse SKILL.md after clone')
    return meta
  }

  async removeSkill(skillPath: string): Promise<void> {
    await rm(skillPath, { recursive: true, force: true })
    // Also remove from disabled list if present
    const disabled = (this.store.get('skillsDisabled') as string[]) || []
    this.store.set(
      'skillsDisabled',
      disabled.filter((p) => p !== skillPath)
    )
  }

  setSkillEnabled(skillPath: string, enabled: boolean): void {
    const disabled = (this.store.get('skillsDisabled') as string[]) || []
    if (enabled) {
      this.store.set(
        'skillsDisabled',
        disabled.filter((p) => p !== skillPath)
      )
    } else {
      if (!disabled.includes(skillPath)) {
        this.store.set('skillsDisabled', [...disabled, skillPath])
      }
    }
  }

  private async findSkillRoot(dir: string): Promise<string | null> {
    // Check if SKILL.md exists at this level
    try {
      await stat(join(dir, 'SKILL.md'))
      return dir
    } catch {
      // Check one level down
      try {
        const entries = await readdir(dir)
        for (const entry of entries) {
          const entryPath = join(dir, entry)
          const entryStat = await stat(entryPath)
          if (entryStat.isDirectory()) {
            try {
              await stat(join(entryPath, 'SKILL.md'))
              return entryPath
            } catch {
              continue
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return null
  }
}
