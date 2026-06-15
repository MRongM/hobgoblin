import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ELECTRON_RENDERER_CAPABILITIES, RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'
import { setRendererBridgeForTests } from '#/web/renderer-bridge.ts'

describe('fetchServerJson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRendererBridgeForTests({
      kind: () => 'electron',
      hasCapability: () => true,
      getBootstrap: () => ({
        runtime: {
          kind: 'electron',
          bridgeVersion: RENDERER_BRIDGE_VERSION,
          capabilities: [...ELECTRON_RENDERER_CAPABILITIES],
        },
        homeDir: '/home',
        initialI18n: null,
        initialSettings: null,
        initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret', clientId: 'client_sharedterminal' },
      }),
      invokeRpc: vi.fn(),
      abortRpc: vi.fn(),
      onRpcEvent: vi.fn(() => () => {}),
      onEffectIntent: vi.fn(() => () => {}),
      pathForFile: vi.fn(() => ''),
      shell: () => null,
      terminal: vi.fn(),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
  })

  test('bypasses the browser http cache for embedded server requests', async () => {
    const { fetchServerJson } = await import('#/web/lib/server-fetch.ts')

    await fetchServerJson('/api/settings')

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:32100/api/settings', {
      cache: 'no-store',
      headers: {
        'x-goblin-internal-secret': 'secret',
      },
    })
  })
})
