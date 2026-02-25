import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { platform } from 'os'

const DEFAULT_SHELL = platform() === 'win32' ? 'powershell.exe' : '/bin/zsh'

export class PtyManager {
  private sessions = new Map<string, IPty>()

  constructor(
    private onOutput: (id: string, data: string) => void,
    private onExit: (id: string, exitCode: number) => void
  ) {}

  create(id: string, cwd: string, command?: string): void {
    const shell = DEFAULT_SHELL
    const args: string[] = command ? ['-c', command] : []

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>
    })

    this.sessions.set(id, ptyProcess)

    ptyProcess.onData((data) => {
      this.onOutput(id, data)
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.sessions.delete(id)
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
    session.kill()
    this.sessions.delete(id)
  }

  closeAll(): void {
    for (const [id, session] of this.sessions) {
      session.kill()
      this.sessions.delete(id)
    }
  }
}
