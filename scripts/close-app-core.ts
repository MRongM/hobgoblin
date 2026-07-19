export interface CloseAppRuntime {
  platform: NodeJS.Platform
  isRunning: () => Promise<boolean>
  requestGracefulQuit: (signal: AbortSignal) => Promise<void>
  forceQuit: () => Promise<void>
  sleep: (milliseconds: number) => Promise<void>
  log: (message: string) => void
}

export interface CloseAppOptions {
  gracefulQuitTimeoutMs?: number
  pollAttempts?: number
  pollIntervalMs?: number
  forceQuitSettleMs?: number
}

async function requestGracefulQuitWithinTimeout(
  requestGracefulQuit: CloseAppRuntime['requestGracefulQuit'],
  timeoutMs: number,
): Promise<'completed' | 'timed-out'> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const request = requestGracefulQuit(controller.signal).then(
    () => 'completed' as const,
    () => 'completed' as const,
  )
  const deadline = new Promise<'timed-out'>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort()
      resolve('timed-out')
    }, timeoutMs)
  })

  const outcome = await Promise.race([request, deadline])
  if (timeout) clearTimeout(timeout)
  return outcome
}

export async function closeRunningAppWithRuntime(
  runtime: CloseAppRuntime,
  options: CloseAppOptions = {},
): Promise<void> {
  if (runtime.platform !== 'darwin') return
  if (!(await runtime.isRunning())) return

  runtime.log('Hobgoblin is running, attempting graceful quit...')

  const gracefulQuitTimeoutMs = options.gracefulQuitTimeoutMs ?? 3000
  const gracefulQuitOutcome = await requestGracefulQuitWithinTimeout(runtime.requestGracefulQuit, gracefulQuitTimeoutMs)
  if (gracefulQuitOutcome === 'timed-out') {
    runtime.log(`Hobgoblin did not acknowledge quit within ${gracefulQuitTimeoutMs}ms; checking process state...`)
  }

  const pollAttempts = options.pollAttempts ?? 10
  const pollIntervalMs = options.pollIntervalMs ?? 500
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    if (!(await runtime.isRunning())) {
      runtime.log('Hobgoblin quit.')
      return
    }
    await runtime.sleep(pollIntervalMs)
  }

  if (await runtime.isRunning()) {
    runtime.log('Forcing Hobgoblin to quit...')
    await runtime.forceQuit()
    await runtime.sleep(options.forceQuitSettleMs ?? 1000)
  }
}
