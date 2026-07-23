import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  previewAssociatedTmuxSessions: vi.fn(),
  cleanupAssociatedTmuxSessions: vi.fn(),
}))

vi.mock('#/server/modules/tmux-cleanup.ts', () => mocks)

describe('tmux cleanup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('forwards preview targets and request cancellation', async () => {
    mocks.previewAssociatedTmuxSessions.mockResolvedValue({ ok: true, targetPath: '/work/repo', sessions: [] })
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    const response = await app.request('http://localhost/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectRoot: '/work/repo', itemPath: '/work/repo' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, targetPath: '/work/repo', sessions: [] })
    expect(mocks.previewAssociatedTmuxSessions).toHaveBeenCalledWith(
      { projectRoot: '/work/repo', itemPath: '/work/repo' },
      undefined,
      expect.any(AbortSignal),
    )
  })

  test('forwards only typed cleanup inputs', async () => {
    mocks.cleanupAssociatedTmuxSessions.mockResolvedValue({
      ok: true,
      targetPath: '/work/repo',
      deleted: [],
      missingSessionIds: [],
      failed: [],
    })
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    await app.request('http://localhost/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectRoot: '/work/repo', itemPath: '/work/repo', approvedSessionIds: ['$1'] }),
    })

    expect(mocks.cleanupAssociatedTmuxSessions).toHaveBeenCalledWith(
      { projectRoot: '/work/repo', itemPath: '/work/repo', approvedSessionIds: ['$1'] },
      undefined,
      expect.any(AbortSignal),
    )
  })

  test('returns a stable failure when a route dependency throws', async () => {
    mocks.previewAssociatedTmuxSessions.mockRejectedValue(new Error('boom'))
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')

    const response = await createTmuxCleanupRoutes().request('http://localhost/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.tmux-command-failed' })
  })
})
