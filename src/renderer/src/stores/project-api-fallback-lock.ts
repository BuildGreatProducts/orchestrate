let fallbackDepth = 0
let waiters: Array<() => void> = []

export function beginProjectApiFallback(): () => void {
  fallbackDepth += 1
  let released = false

  return () => {
    if (released) return
    released = true
    fallbackDepth = Math.max(0, fallbackDepth - 1)
    if (fallbackDepth > 0) return

    const pending = waiters
    waiters = []
    for (const resolve of pending) resolve()
  }
}

export async function waitForProjectApiFallback(): Promise<void> {
  if (fallbackDepth === 0) return
  await new Promise<void>((resolve) => {
    waiters.push(resolve)
  })
}
