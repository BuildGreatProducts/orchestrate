import { execFileSync } from 'child_process'

const DELIMITER = '__ORCHESTRATE_PATH__'

/**
 * Fix process.env.PATH for macOS GUI apps.
 *
 * When Electron is launched from Finder / Dock / Spotlight, it inherits a
 * minimal launchd PATH (/usr/bin:/bin:/usr/sbin:/sbin) that doesn't include
 * user-installed directories (homebrew, nvm, npm global, etc.).  This resolves
 * the user's full shell PATH once at startup so spawned processes (PTY
 * terminals, CLI agents) can find tools like `claude`.
 */
export function fixPath(): void {
  if (process.platform !== 'darwin') return

  const shell = process.env.SHELL || '/bin/zsh'

  try {
    // Launch a login-interactive shell to source all rc files (.zprofile,
    // .zshrc, etc.) and print PATH between delimiters so we can extract it
    // even when rc files produce other output.
    const stdout = execFileSync(
      shell,
      ['-ilc', `printf "${DELIMITER}%s${DELIMITER}" "$PATH"`],
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    const match = stdout.match(new RegExp(`${DELIMITER}(.+?)${DELIMITER}`))
    if (match?.[1]) {
      process.env.PATH = match[1]
    }
  } catch {
    // Shell resolution failed (timeout, broken rc file, etc.).
    // Prepend the most common macOS tool directories as a fallback.
    const home = process.env.HOME || ''
    const fallbackPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      `${home}/.local/bin`
    ]

    const current = process.env.PATH || ''
    const existing = new Set(current.split(':'))
    const missing = fallbackPaths.filter((p) => !existing.has(p))

    if (missing.length) {
      process.env.PATH = [...missing, current].join(':')
    }
  }
}
