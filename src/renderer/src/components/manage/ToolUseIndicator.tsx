const TOOL_LABELS: Record<string, string> = {
  create_task: 'Creating task',
  edit_task: 'Editing task',
  delete_task: 'Deleting task',
  move_task: 'Moving task',
  list_tasks: 'Listing tasks',
  read_task: 'Reading task',
  spawn_terminal: 'Opening terminal',
  send_to_agent: 'Sending to agent',
  read_file: 'Reading file',
  write_file: 'Writing file',
  list_files: 'Listing files',
  delete_file: 'Deleting file',
  create_save_point: 'Creating save point',
  list_save_points: 'Listing save points',
  restore_save_point: 'Restoring save point',
  revert_save_point: 'Reverting save point',
  get_changes: 'Getting changes'
}

function getToolLabel(tool: string, input: Record<string, unknown>): string {
  const base = TOOL_LABELS[tool] || tool
  const detail =
    (input.title as string) ||
    (input.message as string) ||
    (input.path as string) ||
    (input.name as string) ||
    (input.task_id as string) ||
    ''
  if (detail) {
    const truncated = detail.length > 40 ? detail.slice(0, 40) + '...' : detail
    return `${base}: ${truncated}`
  }
  return base
}

interface ToolUseIndicatorProps {
  tool: string
  input: Record<string, unknown>
}

export default function ToolUseIndicator({ tool, input }: ToolUseIndicatorProps): React.JSX.Element {
  return (
    <span className="inline-block rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
      {getToolLabel(tool, input)}
    </span>
  )
}
