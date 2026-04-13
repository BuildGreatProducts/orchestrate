import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { addOutputSubscriber, getOutputBuffer, getPtyDimensions } from '@renderer/stores/terminal'

interface UseMirrorTerminalOptions {
  id: string
}

interface UseMirrorTerminalResult {
  containerRef: (el: HTMLDivElement | null) => void
}

/**
 * Creates a mirror xterm.js Terminal that subscribes to the same PTY output
 * as the primary terminal. Uses the PTY's actual column width so buffered
 * and live output renders correctly. Supports interactive input but does NOT
 * send resize IPC (the primary terminal owns PTY dimensions).
 */
export function useMirrorTerminal({ id }: UseMirrorTerminalOptions): UseMirrorTerminalResult {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const attachedRef = useRef(false)

  /** Fit rows to container but keep cols matching the PTY */
  const fitToContainer = useCallback(
    (term: Terminal, fitAddon: FitAddon) => {
      try {
        // Use FitAddon to calculate the right row count for the container
        fitAddon.fit()
        // Override cols to match the PTY so output renders correctly
        const ptyDims = getPtyDimensions(id)
        if (ptyDims && term.cols !== ptyDims.cols) {
          term.resize(ptyDims.cols, term.rows)
        }
      } catch {
        // ignore
      }
    },
    [id]
  )

  const attachToContainer = useCallback(
    (el: HTMLDivElement) => {
      const term = termRef.current
      const fitAddon = fitAddonRef.current
      if (!term || !fitAddon || attachedRef.current) return

      el.replaceChildren()
      term.open(el)
      attachedRef.current = true

      requestAnimationFrame(() => {
        if (!attachedRef.current) return
        fitToContainer(term, fitAddon)
      })

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (termRef.current && fitAddonRef.current) {
            fitToContainer(termRef.current, fitAddonRef.current)
          }
        })
      })

      observer.observe(el)
      observerRef.current = observer
    },
    [fitToContainer]
  )

  useEffect(() => {
    // Match the PTY's column count so buffered output renders correctly
    const ptyDims = getPtyDimensions(id)

    const term = new Terminal({
      cols: ptyDims?.cols ?? 80,
      rows: ptyDims?.rows ?? 24,
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        cursorAccent: '#09090b',
        selectionBackground: '#3f3f46',
        selectionForeground: '#fafafa',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa'
      },
      cursorBlink: true,
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 13,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Forward user input to the real PTY
    term.onData((data) => {
      window.orchestrate.writeTerminal(id, data)
    })

    // Replay buffered output so the mirror shows existing content
    const buffered = getOutputBuffer(id)
    if (buffered) {
      term.write(buffered)
    }

    // Subscribe to live output
    const unsubscribe = addOutputSubscriber(id, (data) => {
      term.write(data)
    })

    // Attach if container already captured
    if (containerElRef.current && !attachedRef.current) {
      attachToContainer(containerElRef.current)
    }

    return () => {
      unsubscribe()
      observerRef.current?.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      attachedRef.current = false
    }
  }, [id, attachToContainer])

  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerElRef.current = el
      if (el) {
        attachToContainer(el)
      }
    },
    [attachToContainer]
  )

  return { containerRef }
}
