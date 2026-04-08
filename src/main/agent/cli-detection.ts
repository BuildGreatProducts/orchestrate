/**
 * Utilities for detecting the Claude Code CLI installation.
 */
import { execFile } from 'child_process'

export function isClaudeCliInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })
}

export function getClaudeCliVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      resolve(stdout.trim() || null)
    })
  })
}
