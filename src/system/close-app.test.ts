import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, test, vi } from 'vitest'

import { closeRunningAppWithRuntime, type CloseAppRuntime } from '../../scripts/close-app-core.ts'

function createRuntime(overrides: Partial<CloseAppRuntime> = {}): CloseAppRuntime {
  return {
    platform: 'darwin',
    isRunning: vi.fn(async () => false),
    requestGracefulQuit: vi.fn(async () => {}),
    forceQuit: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  }
}

describe('closeRunningAppWithRuntime', () => {
  test('does nothing when the packaged app is not running', async () => {
    const runtime = createRuntime()

    await closeRunningAppWithRuntime(runtime)

    expect(runtime.requestGracefulQuit).not.toHaveBeenCalled()
    expect(runtime.forceQuit).not.toHaveBeenCalled()
  })

  test('returns after a successful graceful quit', async () => {
    const runtime = createRuntime({
      isRunning: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })

    await closeRunningAppWithRuntime(runtime)

    expect(runtime.requestGracefulQuit).toHaveBeenCalledOnce()
    expect(runtime.forceQuit).not.toHaveBeenCalled()
  })

  test('aborts a stuck graceful quit request and falls back to force quit', async () => {
    let gracefulQuitSignal: AbortSignal | undefined
    const forceQuit = vi.fn(async () => {})
    const closePromise = closeRunningAppWithRuntime(
      createRuntime({
        isRunning: vi.fn(async () => true),
        requestGracefulQuit: (signal) => {
          gracefulQuitSignal = signal
          return new Promise<void>(() => {})
        },
        forceQuit,
      }),
      {
        gracefulQuitTimeoutMs: 5,
        pollAttempts: 1,
        pollIntervalMs: 0,
        forceQuitSettleMs: 0,
      },
    )

    const outcome = await Promise.race([
      closePromise.then(() => 'completed' as const),
      delay(25).then(() => 'stuck' as const),
    ])

    expect(outcome).toBe('completed')
    expect(gracefulQuitSignal?.aborted).toBe(true)
    expect(forceQuit).toHaveBeenCalledOnce()
  })
})
