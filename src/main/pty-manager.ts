import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { platform } from 'os'

function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

export class PtyManager {
  private sessions = new Map<string, IPty>()
  private intentionallyClosed = new Set<string>()

  constructor(
    private onOutput: (id: string, data: string) => void,
    private onExit: (id: string, exitCode: number) => void
  ) {}

  create(
    id: string,
    cwd: string,
    command?: string,
    dimensions?: { cols: number; rows: number }
  ): void {
    // Clean up any existing session with the same id
    if (this.sessions.has(id)) {
      const old = this.sessions.get(id)!
      this.intentionallyClosed.add(id)
      old.kill()
      this.sessions.delete(id)
    }

    const shell = resolveShell()
    const args: string[] = command ? ['-c', command] : []

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: dimensions?.cols && dimensions.cols > 0 ? dimensions.cols : 80,
      rows: dimensions?.rows && dimensions.rows > 0 ? dimensions.rows : 24,
      cwd,
      env: process.env as Record<string, string>
    })

    this.sessions.set(id, ptyProcess)

    ptyProcess.onData((data) => {
      this.onOutput(id, data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.sessions.delete(id)
      if (this.intentionallyClosed.delete(id)) return
      this.onExit(id, exitCode)
    })
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (cols > 0 && rows > 0) {
      session.resize(cols, rows)
    }
  }

  close(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.intentionallyClosed.add(id)
    session.kill()
    this.sessions.delete(id)
  }

  closeAll(): void {
    for (const [id, session] of this.sessions.entries()) {
      this.intentionallyClosed.add(id)
      session.kill()
    }
    this.sessions.clear()
  }
}
