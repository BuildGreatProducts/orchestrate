import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  useTerminalStore,
  registerOutputHandler,
  registerExitHandler,
  unregisterTerminalHandlers,
  signalTerminalReady
} from '@renderer/stores/terminal'

interface UseTerminalOptions {
  id: string
  active: boolean
}

interface UseTerminalResult {
  containerRef: (el: HTMLDivElement | null) => void
  focus: () => void
}

export function useTerminal({ id, active }: UseTerminalOptions): UseTerminalResult {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerElRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const attachedRef = useRef(false)

  // Stable ref to active state for use in callbacks
  const activeRef = useRef(active)
  activeRef.current = active

  const focus = useCallback(() => {
    termRef.current?.focus()
  }, [])

  // Attach terminal to a container element, fit, and observe resizes
  const attachToContainer = useCallback(
    (el: HTMLDivElement) => {
      const term = termRef.current
      const fitAddon = fitAddonRef.current
      if (!term || attachedRef.current) return

      // Remove any leftover DOM from a previously disposed terminal (StrictMode double-mount)
      el.replaceChildren()

      term.open(el)
      attachedRef.current = true
      term.focus()

      // Initial fit + focus after layout
      requestAnimationFrame(() => {
        if (!attachedRef.current) return
        try {
          fitAddon?.fit()
          const dims = fitAddon?.proposeDimensions()
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.orchestrate.resizeTerminal(id, dims.cols, dims.rows)
          }
        } catch {
          // Terminal not yet fully in DOM
        }
        term.focus()
      })

      // ResizeObserver for container size changes
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          try {
            fitAddon?.fit()
            if (activeRef.current) {
              const dims = fitAddon?.proposeDimensions()
              if (dims && dims.cols > 0 && dims.rows > 0) {
                window.orchestrate.resizeTerminal(id, dims.cols, dims.rows)
              }
            }
          } catch {
            // ignore
          }
        })
      })

      observer.observe(el)
      observerRef.current = observer
    },
    [id]
  )

  // Create terminal instance once
  useEffect(() => {
    const term = new Terminal({
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
      scrollback: 10000
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // User input → PTY
    term.onData((data) => {
      window.orchestrate.writeTerminal(id, data)
    })

    // Register with shared dispatcher (single global IPC listener)
    registerOutputHandler(id, (data) => {
      term.write(data)
    })

    registerExitHandler(id, (exitCode) => {
      term.write(`\r\n\x1b[38;5;242m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      useTerminalStore.getState().markExited(id, exitCode)
    })

    // Signal that this terminal's handlers are ready
    signalTerminalReady(id)

    // If the DOM container was already captured by the ref callback
    // before this effect ran, attach now
    if (containerElRef.current && !attachedRef.current) {
      attachToContainer(containerElRef.current)
    }

    return () => {
      unregisterTerminalHandlers(id)
      observerRef.current?.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      attachedRef.current = false
    }
  }, [id, attachToContainer])

  // Ref callback: capture the DOM element; attach if terminal is ready
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerElRef.current = el
      if (el) {
        attachToContainer(el)
      }
    },
    [attachToContainer]
  )

  // Re-fit + focus when tab becomes active
  useEffect(() => {
    if (!active || !attachedRef.current) return

    requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit()
        const dims = fitAddonRef.current?.proposeDimensions()
        if (dims && dims.cols > 0 && dims.rows > 0) {
          window.orchestrate.resizeTerminal(id, dims.cols, dims.rows)
        }
      } catch {
        // ignore
      }
      termRef.current?.focus()
    })
  }, [active, id])

  return { containerRef, focus }
}
