import type { ComponentType } from 'react'
import { FolderOpen, Globe, History, PlugZap, Puzzle, TerminalSquare } from 'lucide-react'
import type { ProjectDetailTabId } from '@shared/types'

type ProjectDetailTabIcon = ComponentType<{ size?: number; className?: string }>

export interface ProjectDetailTabDefinition {
  id: ProjectDetailTabId
  label: string
  icon: ProjectDetailTabIcon
}

export const PROJECT_DETAIL_TABS: ProjectDetailTabDefinition[] = [
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'commands', label: 'Commands', icon: TerminalSquare },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'history', label: 'History', icon: History },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'mcp', label: 'MCP', icon: PlugZap }
]

export const PROJECT_DETAIL_TAB_IDS: ProjectDetailTabId[] = PROJECT_DETAIL_TABS.map(({ id }) => id)
