import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import {
  addOutputSubscriber,
  getOutputBuffer,
  getPtyDimensions,
  setPtyDimensions,
  signalTerminalReady,
  isUsableTerminalDimensions
} from '@renderer/stores/terminal'

interface UseMirrorTerminalOptions {
  id: string
}

interface UseMirrorTerminalResult {
  containerRef: (el: HTMLDivElement | null) => void
}

/**
 * Creates a mirror xterm.js Terminal that subscribes to the same PTY output
 * as the primary terminal. Agent cards are the visible terminal surface for
 * agents, so this hook owns the PTY dimensions and waits to replay output until
 * xterm has a stable fitted size.
 */
export function useMirrorTerminal({ id }: UseMirrorTerminalOptions): UseMirrorTerminalResult {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const attachedRef = useRef(false)
  const outputReadyRef = useRef(false)

  /** Fit to the visible container and sync the backing PTY to that geometry. */
  const fitToContainer = useCallback(
    (fitAddon: FitAddon): boolean => {
      try {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (!dims || !isUsableTerminalDimensions(dims.cols, dims.rows)) {
          return false
        }

        window.orchestrate.resizeTerminal(id, dims.cols, dims.rows)
        setPtyDimensions(id, dims.cols, dims.rows)
        signalTerminalReady(id, dims.cols, dims.rows)
        return true
      } catch {
        // ignore
        return false
      }
    },
    [id]
  )

  const flushPendingOutput = useCallback(
    (term: Terminal) => {
      if (outputReadyRef.current) return
      outputReadyRef.current = true
      const output = getOutputBuffer(id)
      if (output) {
        term.write(output)
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
      if (term.element) {
        el.appendChild(term.element)
      } else {
        term.open(el)
      }
      attachedRef.current = true

      requestAnimationFrame(() => {
        if (!attachedRef.current) return
        if (fitToContainer(fitAddon)) {
          flushPendingOutput(term)
        }
      })

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (termRef.current && fitAddonRef.current) {
            if (fitToContainer(fitAddonRef.current)) {
              flushPendingOutput(termRef.current)
            }
          }
        })
      })

      observer.observe(el)
      observerRef.current = observer
    },
    [fitToContainer, flushPendingOutput]
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

    outputReadyRef.current = false

    // Subscribe to live output
    const unsubscribe = addOutputSubscriber(id, (data) => {
      if (outputReadyRef.current) {
        term.write(data)
      }
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
      outputReadyRef.current = false
    }
  }, [id, attachToContainer])

  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) {
        observerRef.current?.disconnect()
        observerRef.current = null
        attachedRef.current = false
        containerElRef.current = null
        return
      }
      containerElRef.current = el
      attachToContainer(el)
    },
    [attachToContainer]
  )

  return { containerRef }
}
