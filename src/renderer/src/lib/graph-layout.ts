import type { CommitNode } from '@shared/types'

const COLORS = [
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#fb923c', // orange-400
  '#2dd4bf'  // teal-400
]

export interface GraphConnection {
  parentHash: string
  fromLane: number
  toLane: number
  fromRow: number
  toRow: number
}

export interface GraphNode {
  hash: string
  lane: number
  color: string
  isMerge: boolean
  connections: GraphConnection[]
}

export interface GraphLayout {
  nodes: Map<string, GraphNode>
  maxLane: number
}

export function computeGraphLayout(commits: CommitNode[]): GraphLayout {
  const nodes = new Map<string, GraphNode>()
  const hashToRow = new Map<string, number>()

  // Map each commit hash to its row index
  for (let i = 0; i < commits.length; i++) {
    hashToRow.set(commits[i].hash, i)
  }

  // Track which lane each expected next-commit should appear in
  // Key: commit hash we expect to see, Value: lane it should occupy
  const reservedLanes = new Map<string, number>()

  // Track which lanes are currently in use (occupied by an active branch line)
  const activeLanes = new Set<number>()

  // Map branch ref names to colors for consistency
  const branchColors = new Map<string, string>()

  function getNextFreeLane(): number {
    let lane = 0
    while (activeLanes.has(lane)) lane++
    return lane
  }

  function getColorForLane(lane: number, refs: string[]): string {
    // Try to assign color by branch name for consistency
    for (const ref of refs) {
      const branchName = ref.replace(/^HEAD -> /, '')
      if (branchColors.has(branchName)) {
        return branchColors.get(branchName)!
      }
    }
    // Assign new color from palette
    const color = COLORS[lane % COLORS.length]
    for (const ref of refs) {
      const branchName = ref.replace(/^HEAD -> /, '')
      branchColors.set(branchName, color)
    }
    return color
  }

  let maxLane = 0

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]
    const isMerge = commit.parents.length > 1

    // Determine this commit's lane
    let lane: number
    if (reservedLanes.has(commit.hash)) {
      lane = reservedLanes.get(commit.hash)!
      reservedLanes.delete(commit.hash)
    } else {
      lane = getNextFreeLane()
      activeLanes.add(lane)
    }

    if (lane > maxLane) maxLane = lane

    const color = getColorForLane(lane, commit.refs)
    const connections: GraphConnection[] = []

    if (commit.parents.length === 0) {
      // Root commit — release the lane
      activeLanes.delete(lane)
    } else {
      // First parent inherits this lane (continuation)
      const firstParent = commit.parents[0]
      const firstParentRow = hashToRow.get(firstParent)

      if (firstParentRow !== undefined) {
        if (reservedLanes.has(firstParent)) {
          // First parent already reserved by another child — draw connection to that lane
          const targetLane = reservedLanes.get(firstParent)!
          connections.push({
            parentHash: firstParent,
            fromLane: lane,
            toLane: targetLane,
            fromRow: row,
            toRow: firstParentRow
          })
          // Release our lane since we're merging into the existing one
          activeLanes.delete(lane)
        } else {
          // Reserve this lane for the first parent
          reservedLanes.set(firstParent, lane)
          connections.push({
            parentHash: firstParent,
            fromLane: lane,
            toLane: lane,
            fromRow: row,
            toRow: firstParentRow
          })
        }
      } else {
        // Parent not in our commit list (truncated) — keep lane active but no connection
        activeLanes.delete(lane)
      }

      // Additional parents (merge sources)
      for (let p = 1; p < commit.parents.length; p++) {
        const parentHash = commit.parents[p]
        const parentRow = hashToRow.get(parentHash)
        if (parentRow === undefined) continue

        if (reservedLanes.has(parentHash)) {
          // Parent already has a reserved lane
          const targetLane = reservedLanes.get(parentHash)!
          connections.push({
            parentHash,
            fromLane: lane,
            toLane: targetLane,
            fromRow: row,
            toRow: parentRow
          })
        } else {
          // Allocate a new lane for the merge source
          const mergeLane = getNextFreeLane()
          activeLanes.add(mergeLane)
          if (mergeLane > maxLane) maxLane = mergeLane
          reservedLanes.set(parentHash, mergeLane)
          connections.push({
            parentHash,
            fromLane: lane,
            toLane: mergeLane,
            fromRow: row,
            toRow: parentRow
          })
        }
      }
    }

    nodes.set(commit.hash, {
      hash: commit.hash,
      lane,
      color,
      isMerge,
      connections
    })
  }

  return { nodes, maxLane }
}
