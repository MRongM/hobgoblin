import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPortForwardSessions: vi.fn(),
  startPortForwardSession: vi.fn(),
  stopPortForwardSession: vi.fn(),
  stopPortForwardSessionsForRepo: vi.fn(),
}))

vi.mock('#/server/modules/port-forwarding.ts', () => ({
  listPortForwardSessions: mocks.listPortForwardSessions,
  startPortForwardSession: mocks.startPortForwardSession,
  stopPortForwardSession: mocks.stopPortForwardSession,
  stopPortForwardSessionsForRepo: mocks.stopPortForwardSessionsForRepo,
}))

describe('port forwarding routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [] })
    mocks.startPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-start-failed' })
    mocks.stopPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-not-found' })
    mocks.stopPortForwardSessionsForRepo.mockResolvedValue({ ok: true, stopped: [] })
  })

  test('delegates list/start/stop/stop-for-repo to the module', async () => {
    const { createPortForwardingRoutes } = await import('#/server/routes/port-forwarding.ts')
    const app = createPortForwardingRoutes()

    await app.request(
      new Request('http://127.0.0.1/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }),
      }),
    )
    await app.request(
      new Request('http://127.0.0.1/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 }),
      }),
    )
    await app.request(
      new Request('http://127.0.0.1/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'pf_1' }),
      }),
    )
    await app.request(
      new Request('http://127.0.0.1/stop-for-repo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }),
      }),
    )

    expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 },
      expect.any(AbortSignal),
    )
    expect(mocks.stopPortForwardSession).toHaveBeenCalledWith('pf_1')
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
  })
})
