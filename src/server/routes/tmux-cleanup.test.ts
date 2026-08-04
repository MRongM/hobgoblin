import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  previewAssociatedTmuxSessions: vi.fn(),
  cleanupAssociatedTmuxSessions: vi.fn(),
  previewHostTmuxSessions: vi.fn(),
  closeHostTmuxSessions: vi.fn(),
  openHostTmuxSession: vi.fn(),
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
      missingSessionNames: [],
      failed: [],
    })
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    await app.request('http://localhost/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectRoot: '/work/repo',
        itemPath: '/work/repo',
        approvedSessionNames: ['hobgoblin-v1-0123456789abcdef01234567'],
      }),
    })

    expect(mocks.cleanupAssociatedTmuxSessions).toHaveBeenCalledWith(
      {
        projectRoot: '/work/repo',
        itemPath: '/work/repo',
        approvedSessionNames: ['hobgoblin-v1-0123456789abcdef01234567'],
      },
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

  test('forwards host preview and typed exact-origin close approvals', async () => {
    mocks.previewHostTmuxSessions.mockResolvedValue({ ok: true, sessions: [] })
    mocks.closeHostTmuxSessions.mockResolvedValue({ ok: true, closed: [], missing: [], failed: [] })
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    const previewResponse = await app.request('http://localhost/host-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectRoot: 'ssh-config://prod/srv/repo', ignored: true }),
    })
    const closeResponse = await app.request('http://localhost/host-execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectRoot: 'ssh-config://prod/srv/repo',
        approvedSessions: [
          {
            kind: 'hobgoblin',
            sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
            serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
            ignored: true,
          },
          { kind: 'default', sessionName: 'editor work' },
        ],
      }),
    })

    expect(previewResponse.status).toBe(200)
    expect(closeResponse.status).toBe(200)
    expect(mocks.previewHostTmuxSessions).toHaveBeenCalledWith(
      { projectRoot: 'ssh-config://prod/srv/repo' },
      undefined,
      expect.any(AbortSignal),
    )
    expect(mocks.closeHostTmuxSessions).toHaveBeenCalledWith(
      {
        projectRoot: 'ssh-config://prod/srv/repo',
        approvedSessions: [
          {
            kind: 'hobgoblin',
            sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
            serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
          },
          { kind: 'default', sessionName: 'editor work' },
        ],
      },
      undefined,
      expect.any(AbortSignal),
    )
  })

  test('rejects the entire Host close request when any approved identity is invalid', async () => {
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    const response = await app.request('http://localhost/host-execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectRoot: '/work/repo',
        approvedSessions: [
          { kind: 'default', sessionName: 'editor work' },
          { kind: 'default', sessionName: 'invalid-origin', serverName: 'named' },
        ],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(mocks.closeHostTmuxSessions).not.toHaveBeenCalled()
  })

  test('forwards one typed Host session identity for external open', async () => {
    mocks.openHostTmuxSession.mockResolvedValue({ ok: true, status: 'opened' })
    const { createTmuxCleanupRoutes } = await import('#/server/routes/tmux-cleanup.ts')
    const app = createTmuxCleanupRoutes()

    const response = await app.request('http://localhost/host-open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectRoot: '/work/repo',
        session: { kind: 'default', sessionName: 'editor work', ignored: true },
      }),
    })

    expect(response.status).toBe(200)
    expect(mocks.openHostTmuxSession).toHaveBeenCalledWith(
      {
        projectRoot: '/work/repo',
        session: { kind: 'default', sessionName: 'editor work' },
      },
      undefined,
      expect.any(AbortSignal),
    )
  })
})
