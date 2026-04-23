import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { platform } from 'os'
import { saveTerminalSessions, clearTerminalSessions } from './session-persistence'

function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

export class PtyManager {
  private sessions = new Map<string, IPty>()
  private cwdById = new Map<string, string>()
  private commandById = new Map<string, string | undefined>()

  constructor(
    private onOutput: (id: string, data: string) => void,
    private onExit: (id: string, exitCode: number) => void
  ) {}

  create(id: string, cwd: string, command?: string): void {
    if (this.sessions.has(id)) {
      this.sessions.get(id)!.kill()
      this.sessions.delete(id)
    }

    const shell = resolveShell()
    const args: string[] = command ? ['-c', command] : []

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>
    })

    this.sessions.set(id, ptyProcess)
    this.cwdById.set(id, cwd)
    this.commandById.set(id, command)
    this._persist()

    ptyProcess.onData((data) => {
      this.onOutput(id, data)
    })

    ptyProcess.onExit(() => {
      this.sessions.delete(id)
      this.cwdById.delete(id)
      this.commandById.delete(id)
      this._persist()
      this.onExit(id, 0)
    })
  }

  private _persist(): void {
    const entries = Array.from(this.sessions.keys()).map((id) => ({
      id,
      cwd: this.cwdById.get(id) || process.env.HOME || '/',
      command: this.commandById.get(id)
    }))
    saveTerminalSessions(entries)
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session || cols <= 0 || rows <= 0) return
    session.resize(cols, rows)
  }

  close(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.kill()
    this.sessions.delete(id)
    this.cwdById.delete(id)
    this.commandById.delete(id)
    this._persist()
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.kill()
    }
    this.sessions.clear()
    this.cwdById.clear()
    this.commandById.clear()
    clearTerminalSessions()
  }
}