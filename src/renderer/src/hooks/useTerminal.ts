import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  useTerminalStore,
  addOutputSubscriber,
  registerExitHandler,
  unregisterTerminalHandlers,
  signalTerminalReady,
  setPtyDimensions
} from '@renderer/stores/terminal'
import { handleTaskTerminalExit } from '@renderer/stores/task-terminal-bridge'

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
            setPtyDimensions(id, dims.cols, dims.rows)
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
                setPtyDimensions(id, dims.cols, dims.rows)
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

    // Update tab name when the terminal title changes (via OSC escape sequences)
    term.onTitleChange((title) => {
      if (title) {
        useTerminalStore.getState().updateTabName(id, title)
      }
    })

    // Bell → alert indicator
    term.onBell(() => {
      useTerminalStore.getState().markBell(id)
    })

    // Register with shared dispatcher (multi-subscriber broadcast)
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let bellClearTimer: ReturnType<typeof setTimeout> | null = null

    // Arm attention timer immediately so agents that never emit output
    // (e.g. waiting for input from the start) still trigger attention.
    let attentionTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      const s = useTerminalStore.getState()
      const t = s.tabs.find((tab) => tab.id === id)
      if (t && t.isAgent && !t.exited) {
        s.markBell(id)
      }
    }, 3000)

    const unsubscribeOutput = addOutputSubscriber(id, (data) => {
      term.write(data)

      // Mark busy on output, then idle after 800ms of silence
      const store = useTerminalStore.getState()
      const tab = store.tabs.find((t) => t.id === id)
      if (tab && !tab.busy) {
        store.markBusy(id, true)
      }
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        useTerminalStore.getState().markBusy(id, false)
        // Terminal went idle — cancel bell-clear since this was brief output (e.g. resize redraw)
        if (bellClearTimer) {
          clearTimeout(bellClearTimer)
          bellClearTimer = null
        }
      }, 800)

      // Agent attention: if an agent terminal goes idle for 3s, mark as needing attention
      if (attentionTimer) clearTimeout(attentionTimer)
      attentionTimer = setTimeout(() => {
        const s = useTerminalStore.getState()
        const t = s.tabs.find((tab) => tab.id === id)
        if (t && t.isAgent && !t.exited) {
          s.markBell(id)
        }
      }, 3000)

      // Clear bell only after 2s of sustained output (agent is truly working again).
      // Brief output bursts (resize redraws) won't clear bell because the idle timer
      // fires first (800ms) and cancels this timer.
      if (tab && tab.bell && !bellClearTimer) {
        bellClearTimer = setTimeout(() => {
          useTerminalStore.getState().clearBell(id)
          bellClearTimer = null
        }, 2000)
      }
    })

    registerExitHandler(id, (exitCode) => {
      term.write(`\r\n\x1b[38;5;242m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      if (idleTimer) clearTimeout(idleTimer)
      if (attentionTimer) clearTimeout(attentionTimer)
      if (bellClearTimer) { clearTimeout(bellClearTimer); bellClearTimer = null }
      useTerminalStore.getState().markBusy(id, false)
      useTerminalStore.getState().markExited(id, exitCode)
      // Fire-and-forget: auto-complete task workflow if this terminal is linked to a task
      handleTaskTerminalExit(id, exitCode)
    })

    // Signal that this terminal's handlers are ready
    signalTerminalReady(id)

    // If the DOM container was already captured by the ref callback
    // before this effect ran, attach now
    if (containerElRef.current && !attachedRef.current) {
      attachToContainer(containerElRef.current)
    }

    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      if (attentionTimer) clearTimeout(attentionTimer)
      if (bellClearTimer) clearTimeout(bellClearTimer)
      unsubscribeOutput()
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
          setPtyDimensions(id, dims.cols, dims.rows)
        }
      } catch {
        // ignore
      }
      termRef.current?.focus()
    })
  }, [active, id])

  return { containerRef, focus }
}
