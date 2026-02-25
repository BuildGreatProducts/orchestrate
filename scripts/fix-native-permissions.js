// node-pty ships prebuilt spawn-helper binaries, but npm may strip
// their execute permission during extraction. Without +x, posix_spawnp
// fails at runtime when trying to create a PTY.
const fs = require('fs')
const path = require('path')

const prebuildsDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds')

if (fs.existsSync(prebuildsDir)) {
  for (const arch of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, arch, 'spawn-helper')
    if (fs.existsSync(helper)) {
      fs.chmodSync(helper, 0o755)
    }
  }
}
