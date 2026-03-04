import { useMemo } from 'react'
import type { CommitNode } from '@shared/types'
import { computeGraphLayout } from '@renderer/lib/graph-layout'

const ROW_HEIGHT = 40
const LANE_WIDTH = 20
const DOT_RADIUS = 5
const PADDING_LEFT = 12

export default function CommitGraph({
  commits,
  hoveredHash,
  selectedHash,
  onHover,
  onSelect
}: {
  commits: CommitNode[]
  hoveredHash: string | null
  selectedHash: string | null
  onHover: (hash: string | null) => void
  onSelect: (hash: string) => void
}): React.JSX.Element {
  const layout = useMemo(() => computeGraphLayout(commits), [commits])

  const width = PADDING_LEFT + (layout.maxLane + 1) * LANE_WIDTH + PADDING_LEFT
  const height = commits.length * ROW_HEIGHT

  function laneX(lane: number): number {
    return PADDING_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2
  }

  function rowY(row: number): number {
    return row * ROW_HEIGHT + ROW_HEIGHT / 2
  }

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      style={{ minWidth: width }}
    >
      {/* Draw connections first (behind dots) */}
      {commits.map((commit) => {
        const node = layout.nodes.get(commit.hash)
        if (!node) return null
        return node.connections.map((conn, i) => {
          const x1 = laneX(conn.fromLane)
          const y1 = rowY(conn.fromRow)
          const x2 = laneX(conn.toLane)
          const y2 = rowY(conn.toRow)

          if (conn.fromLane === conn.toLane) {
            // Straight vertical line
            return (
              <line
                key={`${commit.hash}-conn-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={node.color}
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            )
          }

          // Bezier curve for cross-lane connections
          const midY = y1 + (y2 - y1) * 0.4
          const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
          return (
            <path
              key={`${commit.hash}-conn-${i}`}
              d={d}
              fill="none"
              stroke={node.color}
              strokeWidth={2}
              strokeOpacity={0.6}
            />
          )
        })
      })}

      {/* Draw commit dots and hover targets */}
      {commits.map((commit, row) => {
        const node = layout.nodes.get(commit.hash)
        if (!node) return null

        const cx = laneX(node.lane)
        const cy = rowY(row)
        const isHovered = hoveredHash === commit.hash
        const isSelected = selectedHash === commit.hash
        const highlighted = isHovered || isSelected

        return (
          <g
            key={commit.hash}
            onMouseEnter={() => onHover(commit.hash)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(commit.hash)}
            className="cursor-pointer"
          >
            {/* Invisible hover target spanning full row width */}
            <rect
              x={0}
              y={row * ROW_HEIGHT}
              width={width}
              height={ROW_HEIGHT}
              fill="transparent"
            />
            {/* Merge commit: double ring */}
            {node.isMerge ? (
              <>
                <circle
                  cx={cx}
                  cy={cy}
                  r={DOT_RADIUS + 2}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={2}
                  opacity={highlighted ? 1 : 0.8}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={DOT_RADIUS - 1}
                  fill={node.color}
                  opacity={highlighted ? 1 : 0.8}
                />
              </>
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={highlighted ? DOT_RADIUS + 1 : DOT_RADIUS}
                fill={node.color}
                opacity={highlighted ? 1 : 0.8}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
