import { useEffect, useState, useRef } from 'react'
import { useSkillsStore } from '../../stores/skills'
import type { SkillMeta } from '@shared/types'

function SkillItem({
  skill,
  onToggle,
  onRemove
}: {
  skill: SkillMeta
  onToggle: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={skill.enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}
        aria-pressed={skill.enabled}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-600 transition-colors hover:border-zinc-400"
        style={{ backgroundColor: skill.enabled ? '#fff' : 'transparent' }}
      >
        {skill.enabled && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5l2 2 4-4"
              stroke="#18181b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{skill.name}</div>
        {skill.description && (
          <div className="truncate text-xs text-zinc-500">{skill.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove skill"
        className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M6 6.5v3M8 6.5v3M4 4l.5 7a1 1 0 001 1h3a1 1 0 001-1L10 4"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

function AddSkillMenu({
  target,
  onClose
}: {
  target: 'global' | 'project'
  onClose: () => void
}): React.JSX.Element {
  const [showGitInput, setShowGitInput] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const addFromFolder = useSkillsStore((s) => s.addFromFolder)
  const addFromZip = useSkillsStore((s) => s.addFromZip)
  const addFromGit = useSkillsStore((s) => s.addFromGit)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleGitClone = async (): Promise<void> => {
    if (!gitUrl.trim()) return
    setIsCloning(true)
    try {
      await addFromGit(gitUrl.trim(), target)
      onClose()
    } finally {
      setIsCloning(false)
    }
  }

  if (showGitInput) {
    return (
      <div ref={menuRef} className="mt-1 flex gap-2">
        <input
          type="text"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGitClone()
            if (e.key === 'Escape') onClose()
            if (e.metaKey || e.ctrlKey) e.stopPropagation()
          }}
          placeholder="https://github.com/user/skill.git"
          className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
          autoFocus
        />
        <button
          onClick={handleGitClone}
          disabled={!gitUrl.trim() || isCloning}
          className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          {isCloning ? 'Cloning...' : 'Clone'}
        </button>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div ref={menuRef} className="mt-1 rounded border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
      <button
        onClick={async () => {
          await addFromFolder(target)
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M1 3.5V10a1 1 0 001 1h8a1 1 0 001-1V4.5a1 1 0 00-1-1H6L5 2H2a1 1 0 00-1 1z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        Import Folder
      </button>
      <button
        onClick={async () => {
          await addFromZip(target)
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="1" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1" />
          <path d="M5 3h2M5 5h2M5 7h2" stroke="currentColor" strokeWidth="0.75" />
        </svg>
        Import Zip
      </button>
      <button
        onClick={() => setShowGitInput(true)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" />
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="0.75" />
          <path
            d="M2.5 3.5Q6 5 9.5 3.5M2.5 8.5Q6 7 9.5 8.5"
            stroke="currentColor"
            strokeWidth="0.75"
          />
        </svg>
        Clone from Git
      </button>
    </div>
  )
}

function SkillGroup({
  title,
  skills,
  target
}: {
  title: string
  skills: SkillMeta[]
  target: 'global' | 'project'
}): React.JSX.Element {
  const [showMenu, setShowMenu] = useState(false)
  const toggleSkill = useSkillsStore((s) => s.toggleSkill)
  const removeSkill = useSkillsStore((s) => s.removeSkill)
  const openFolder = useSkillsStore((s) => s.openFolder)

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {skills.length === 0 ? (
        <p className="text-xs text-zinc-600">No skills installed</p>
      ) : (
        <div className="space-y-1">
          {skills.map((skill) => (
            <SkillItem
              key={skill.path}
              skill={skill}
              onToggle={() => toggleSkill(skill.path)}
              onRemove={() => removeSkill(skill.path)}
            />
          ))}
        </div>
      )}
      <div className="relative flex gap-2">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
        >
          + Add Skill
        </button>
        <button
          onClick={() => openFolder(target)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
        >
          Open Folder
        </button>
      </div>
      {showMenu && <AddSkillMenu target={target} onClose={() => setShowMenu(false)} />}
    </div>
  )
}

export default function SkillsSettings(): React.JSX.Element {
  const skills = useSkillsStore((s) => s.skills)
  const isLoading = useSkillsStore((s) => s.isLoading)
  const error = useSkillsStore((s) => s.error)
  const loadSkills = useSkillsStore((s) => s.loadSkills)

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const globalSkills = skills.filter((s) => s.source === 'global')
  const projectSkills = skills.filter((s) => s.source === 'project')

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6">
        <h2 className="text-lg font-semibold text-zinc-200">Agent Skills</h2>
        <p className="text-sm text-zinc-400">
          Skills extend the AI agent with specialized knowledge and workflows. Each skill is a
          folder containing a SKILL.md file.
        </p>

        {error && (
          <p className="rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading skills...</p>
        ) : (
          <>
            <SkillGroup
              title="Global skills (~/.orchestrate/skills/)"
              skills={globalSkills}
              target="global"
            />
            <SkillGroup title="Project skills (.skills/)" skills={projectSkills} target="project" />
          </>
        )}

        <p className="text-xs text-zinc-500">
          Learn more about the{' '}
          <a
            href="https://agentskills.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 underline hover:text-zinc-300"
          >
            Agent Skills
          </a>{' '}
          open standard.
        </p>
      </div>
    </div>
  )
}
