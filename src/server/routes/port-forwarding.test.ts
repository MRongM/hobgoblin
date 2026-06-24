import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPortForwardSessions: vi.fn(),
  startPortForwardSession: vi.fn(),
  stopPortForwardSession: vi.fn(),
  stopPortForwardSessionsForRepo: vi.fn(),
  deletePortForwardSession: vi.fn(),
  activatePortForwardSession: vi.fn(),
}))

vi.mock('#/server/modules/port-forwarding.ts', () => ({
  listPortForwardSessions: mocks.listPortForwardSessions,
  startPortForwardSession: mocks.startPortForwardSession,
  stopPortForwardSession: mocks.stopPortForwardSession,
  stopPortForwardSessionsForRepo: mocks.stopPortForwardSessionsForRepo,
  deletePortForwardSession: mocks.deletePortForwardSession,
  activatePortForwardSession: mocks.activatePortForwardSession,
}))

describe('port forwarding routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [] })
    mocks.startPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-start-failed' })
    mocks.stopPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-not-found' })
    mocks.stopPortForwardSessionsForRepo.mockResolvedValue({ ok: true, stopped: [] })
    mocks.deletePortForwardSession.mockResolvedValue({ ok: true, deletedId: 'pf_1' })
    mocks.activatePortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-not-found' })
  })

  test('delegates list/start/stop/stop-for-repo/delete/activate to the module', async () => {
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
    await app.request(
      new Request('http://127.0.0.1/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'pf_1' }),
      }),
    )
    await app.request(
      new Request('http://127.0.0.1/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'pf_1' }),
      }),
    )

    expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 },
      expect.any(AbortSignal),
    )
    expect(mocks.stopPortForwardSession).toHaveBeenCalledWith('pf_1')
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
    expect(mocks.deletePortForwardSession).toHaveBeenCalledWith('pf_1')
    expect(mocks.activatePortForwardSession).toHaveBeenCalledWith('pf_1', expect.any(AbortSignal))
  })
})
