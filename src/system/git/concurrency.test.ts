import { describe, expect, test, vi } from 'vitest'
import { createGitStatusReadScheduler, gitStatusReadConcurrency } from '#/system/git/concurrency.ts'

describe('Git status read concurrency', () => {
  test('uses a lower process-wide limit on Windows', () => {
    expect(gitStatusReadConcurrency('win32')).toBe(8)
    expect(gitStatusReadConcurrency('linux')).toBe(16)
    expect(gitStatusReadConcurrency('darwin')).toBe(16)
  })

  test('never starts more tasks than the configured limit', async () => {
    const scheduler = createGitStatusReadScheduler(2)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let active = 0
    let maximumActive = 0
    let started = 0

    const tasks = Array.from({ length: 5 }, () =>
      scheduler.schedule(async () => {
        started += 1
        active += 1
        maximumActive = Math.max(maximumActive, active)
        try {
          await gate
        } finally {
          active -= 1
        }
      }),
    )

    await vi.waitFor(() => expect(started).toBe(2))
    expect(maximumActive).toBe(2)
    release()
    await Promise.all(tasks)
    expect(started).toBe(5)
    expect(maximumActive).toBe(2)
  })

  test('removes an aborted task before it starts', async () => {
    const scheduler = createGitStatusReadScheduler(1)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let firstStarted = false
    let queuedStarted = false
    const controller = new AbortController()

    const first = scheduler.schedule(async () => {
      firstStarted = true
      await gate
    })
    await vi.waitFor(() => expect(firstStarted).toBe(true))

    const queued = scheduler.schedule(
      async () => {
        queuedStarted = true
      },
      { signal: controller.signal },
    )
    controller.abort()

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(queuedStarted).toBe(false)
    release()
    await first
  })

  test('releases a slot when a task rejects', async () => {
    const scheduler = createGitStatusReadScheduler(1)
    const failed = scheduler.schedule(async () => {
      throw new Error('status failed')
    })
    const next = scheduler.schedule(async () => 'continued')

    await expect(failed).rejects.toThrow('status failed')
    await expect(next).resolves.toBe('continued')
  })
})
