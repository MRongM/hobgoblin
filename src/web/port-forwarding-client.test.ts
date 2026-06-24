import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererBootstrapSnapshot } from '#/shared/bootstrap.ts'
import { RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'

function installBootstrap(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __GOBLIN_BOOTSTRAP__: {
        runtime: { kind: 'web', bridgeVersion: RENDERER_BRIDGE_VERSION, capabilities: [] },
        homeDir: '',
        initialI18n: null,
        initialSettings: null,
        initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
      } satisfies RendererBootstrapSnapshot,
      location: { href: 'http://127.0.0.1:32100/', origin: 'http://127.0.0.1:32100', search: '' },
      matchMedia: vi.fn(() => ({ matches: true })),
    },
  })
}

describe('port-forwarding-client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    installBootstrap()
  })

  test('calls list/start/stop endpoints', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, sessions: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('#/web/port-forwarding-client.ts')

    await client.listPortForwardSessions('ssh-config://prod/srv/repo')
    await client.startPortForwardSession({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 })
    await client.stopPortForwardSession('pf_1')
    await client.stopPortForwardSessionsForRepo('ssh-config://prod/srv/repo')
    await client.deletePortForwardSession('pf_1')
    await client.activatePortForwardSession('pf_1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/port-forwarding/list',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/port-forwarding/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:32100/api/port-forwarding/stop',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'pf_1' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:32100/api/port-forwarding/stop-for-repo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://127.0.0.1:32100/api/port-forwarding/delete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'pf_1' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:32100/api/port-forwarding/activate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'pf_1' }) }),
    )
  })
})
