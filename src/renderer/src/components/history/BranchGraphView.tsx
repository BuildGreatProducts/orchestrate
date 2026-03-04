import { useEffect } from 'react'
import { useHistoryStore } from '@renderer/stores/history'
import Spinner from '@renderer/components/ui/Spinner'
import BranchSelector from './BranchSelector'
import CommitGraph from './CommitGraph'
import CommitRow from './CommitRow'
import FileChangeList from './FileChangeList'

export default function BranchGraphView(): React.JSX.Element {
  const commitGraph = useHistoryStore((s) => s.commitGraph)
  const branches = useHistoryStore((s) => s.branches)
  const selectedBranch = useHistoryStore((s) => s.selectedBranch)
  const graphLoading = useHistoryStore((s) => s.graphLoading)
  const selectedCommitHash = useHistoryStore((s) => s.selectedCommitHash)
  const hoveredCommitHash = useHistoryStore((s) => s.hoveredCommitHash)
  const expandedDetail = useHistoryStore((s) => s.expandedDetail)
  const detailLoading = useHistoryStore((s) => s.detailLoading)

  const setSelectedBranch = useHistoryStore((s) => s.setSelectedBranch)
  const selectCommit = useHistoryStore((s) => s.selectCommit)
  const setHoveredCommit = useHistoryStore((s) => s.setHoveredCommit)
  const requestRevert = useHistoryStore((s) => s.requestRevert)
  const requestRestore = useHistoryStore((s) => s.requestRestore)
  const openDiff = useHistoryStore((s) => s.openDiff)
  const loadCommitGraph = useHistoryStore((s) => s.loadCommitGraph)
  const loadBranches = useHistoryStore((s) => s.loadBranches)

  useEffect(() => {
    if (commitGraph.length === 0 && !graphLoading) {
      loadCommitGraph()
    }
    if (branches.length === 0) {
      loadBranches()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (graphLoading && commitGraph.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-4 text-sm text-zinc-500">
        <Spinner className="h-4 w-4" />
        <span>Loading commit graph...</span>
      </div>
    )
  }

  if (commitGraph.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <BranchSelector
          branches={branches}
          selectedBranch={selectedBranch}
          onSelect={setSelectedBranch}
        />
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-zinc-500">
          No commits found.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <BranchSelector
        branches={branches}
        selectedBranch={selectedBranch}
        onSelect={setSelectedBranch}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Side-by-side graph + commit list */}
        <div className="flex">
          <div className="shrink-0 overflow-x-auto border-r border-zinc-800">
            <CommitGraph
              commits={commitGraph}
              hoveredHash={hoveredCommitHash}
              selectedHash={selectedCommitHash}
              onHover={setHoveredCommit}
              onSelect={(hash) => selectCommit(selectedCommitHash === hash ? null : hash)}
            />
          </div>
          <div className="flex-1 min-w-0">
            {commitGraph.map((commit) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                isSelected={selectedCommitHash === commit.hash}
                isHovered={hoveredCommitHash === commit.hash}
                onSelect={() =>
                  selectCommit(selectedCommitHash === commit.hash ? null : commit.hash)
                }
                onHover={(hovered) => setHoveredCommit(hovered ? commit.hash : null)}
                onRevert={() => requestRevert(commit.hash)}
                onRestore={() => requestRestore(commit.hash)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel for selected commit */}
        {selectedCommitHash && (
          <div className="border-t border-zinc-800 px-3 py-3">
            {detailLoading && (
              <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
                <Spinner className="h-3 w-3" />
                Loading changes...
              </div>
            )}
            {expandedDetail && (
              <div>
                <div className="mb-2 text-xs font-medium text-zinc-400">
                  Files Changed ({expandedDetail.files.length})
                </div>
                <FileChangeList
                  files={expandedDetail.files}
                  onViewDiff={(filePath) => openDiff(selectedCommitHash, filePath)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
