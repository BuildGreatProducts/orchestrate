import { useMemo } from 'react'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useAppStore } from '@renderer/stores/app'
import { AGENT_COLORS } from '@renderer/lib/agent-colors'

export interface AgentDot {
  tabId: string
  colorIndex: number
  status: 'active' | 'attention'
}

export interface ProjectAgentStatus {
  dots: AgentDot[]
  hasAttention: boolean
  activeCount: number
}

const EMPTY_STATUS: ProjectAgentStatus = { dots: [], hasAttention: false, activeCount: 0 }

export function useAllProjectsAgentStatus(): Map<string, ProjectAgentStatus> {
  const tabs = useTerminalStore((s) => s.tabs)
  const projects = useAppStore((s) => s.projects)

  return useMemo(() => {
    const result = new Map<string, ProjectAgentStatus>()

    // Group all tabs by project folder
    const tabsByProject = new Map<string, typeof tabs>()
    for (const tab of tabs) {
      const existing = tabsByProject.get(tab.projectFolder)
      if (existing) {
        existing.push(tab)
      } else {
        tabsByProject.set(tab.projectFolder, [tab])
      }
    }

    for (const project of projects) {
      const projectTabs = tabsByProject.get(project)
      if (!projectTabs) {
        result.set(project, EMPTY_STATUS)
        continue
      }

      const dots: AgentDot[] = []
      let hasAttention = false
      let activeCount = 0

      for (let i = 0; i < projectTabs.length; i++) {
        const tab = projectTabs[i]
        if (tab.exited) continue

        if (tab.bell) {
          hasAttention = true
          dots.push({
            tabId: tab.id,
            colorIndex: i % AGENT_COLORS.length,
            status: 'attention'
          })
        } else if (tab.busy) {
          activeCount++
          dots.push({
            tabId: tab.id,
            colorIndex: i % AGENT_COLORS.length,
            status: 'active'
          })
        }
      }

      // Sort: attention first, then active
      dots.sort((a, b) => {
        if (a.status === 'attention' && b.status !== 'attention') return -1
        if (a.status !== 'attention' && b.status === 'attention') return 1
        return 0
      })

      result.set(project, { dots, hasAttention, activeCount })
    }

    return result
  }, [tabs, projects])
}
