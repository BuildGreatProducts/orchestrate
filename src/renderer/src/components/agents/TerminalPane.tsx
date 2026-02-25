import { useTerminal } from '@renderer/hooks/useTerminal'

interface TerminalPaneProps {
  id: string
  active: boolean
}

export default function TerminalPane({ id, active }: TerminalPaneProps): React.JSX.Element {
  const { containerRef, focus } = useTerminal({ id, active })

  return (
    <div
      ref={containerRef}
      onClick={focus}
      className={`absolute inset-0 ${active ? '' : 'invisible'}`}
      style={{ padding: '4px 0 0 4px' }}
    />
  )
}
