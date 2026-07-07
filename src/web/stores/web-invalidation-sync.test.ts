import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererBootstrapSnapshot } from '#/shared/bootstrap.ts'
import { ELECTRON_RENDERER_CAPABILITIES, RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'
import { defaultSettingsSnapshot } from '#/shared/settings-defaults.ts'
import type { RpcEvent } from '#/shared/rpc.ts'
import type { RendererBridge } from '#/web/renderer-bridge-types.ts'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  private listeners = new Map<string, Set<(event: any) => void>>()

  public readonly url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const next = this.listeners.get(type) ?? new Set()
    next.add(listener)
    this.listeners.set(type, next)
  }

  close(): void {
    this.emit('close', {})
  }

  emitMessage(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) })
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function installWebBootstrap(bootstrap: RendererBootstrapSnapshot): void {
  const documentElement = {
    attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value)
    },
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null
    },
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      visibilityState: 'visible',
      documentElement,
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __GOBLIN_BOOTSTRAP__: bootstrap,
      location: {
        href: bootstrap.initialServer?.url ?? 'http://127.0.0.1:32100/',
        origin: bootstrap.initialServer?.url?.replace(/\/$/, '') ?? 'http://127.0.0.1:32100',
        search: '',
      },
      matchMedia: vi.fn(() => ({ matches: false })),
      setInterval,
      clearInterval,
    },
  })
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
}

function webBootstrap(overrides: Partial<RendererBootstrapSnapshot> = {}): RendererBootstrapSnapshot {
  return {
    runtime: { kind: 'web', bridgeVersion: RENDERER_BRIDGE_VERSION, capabilities: [] },
    homeDir: '',
    initialI18n: null,
    initialSettings: null,
    initialServer: null,
    ...overrides,
  }
}

function electronBridge(onEvent: RendererBridge['onRpcEvent']): RendererBridge {
  return {
    kind: () => 'electron',
    hasCapability: () => true,
    getBootstrap: () => ({
      runtime: {
        kind: 'electron',
        bridgeVersion: RENDERER_BRIDGE_VERSION,
        capabilities: [...ELECTRON_RENDERER_CAPABILITIES],
      },
      homeDir: '/Users/test',
      initialI18n: null,
      initialSettings: null,
      initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    }),
    invokeRpc: vi.fn(),
    abortRpc: vi.fn(async () => false),
    onRpcEvent: onEvent,
    onEffectIntent: () => () => {},
    pathForFile: () => '',
    shell: () => null,
    terminal: (() => {
      throw new Error('unused terminal bridge')
    }) as never,
  }
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) throw new Error('Expected websocket to be created')
  return socket
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function waitUntil(assertion: () => void, attempts = 20): Promise<void> {
  let lastError: unknown = null
  for (let index = 0; index < attempts; index++) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await flushAsyncWork()
    }
  }
  throw lastError
}

function settingsSnapshotResponse(overrides: Record<string, unknown> & { colorTheme?: string } = {}) {
  return {
    ...defaultSettingsSnapshot({ globalShortcut: 'CommandOrControl+Shift+G' }),
    colorTheme: 'default',
    ...overrides,
  }
}

describe('web invalidation sync', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    FakeWebSocket.instances = []
  })

  afterEach(async () => {
    const { resetServerInvalidationIngressForTests } = await import('#/web/server-invalidation-ingress.ts')
    resetServerInvalidationIngressForTests()
  })

  test('theme store refetches theme state on theme invalidation', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    let settingsReadCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          settingsReadCount++
          return settingsSnapshotResponse({
            theme: settingsReadCount > 1 ? 'dark' : 'auto',
            colorTheme: settingsReadCount > 1 ? 'github' : 'default',
          })
        },
      })),
    )

    const { useThemeStore } = await import('#/web/stores/theme.ts')
    await useThemeStore.getState().hydrate()
    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['theme'] })
    await waitUntil(() => {
      expect(useThemeStore.getState()).toMatchObject({ pref: 'dark', resolved: 'dark', colorTheme: 'github' })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.getAttribute('data-color-theme')).toBe('github')
    })
  })

  test('settings snapshot invalidation no longer refetches theme state', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    let settingsReadCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          settingsReadCount++
          return settingsSnapshotResponse({
            theme: settingsReadCount > 1 ? 'dark' : 'auto',
            colorTheme: settingsReadCount > 1 ? 'github' : 'default',
          })
        },
      })),
    )

    const { useThemeStore } = await import('#/web/stores/theme.ts')
    await useThemeStore.getState().hydrate()
    const beforeInvalidationReadCount = settingsReadCount

    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['settings-snapshot'] })
    await flushAsyncWork()

    expect(settingsReadCount).toBe(beforeInvalidationReadCount)
    expect(useThemeStore.getState()).toMatchObject({ pref: 'auto', resolved: 'light', colorTheme: 'default' })
  })

  test('theme store applies native host theme changes without settings refetch', async () => {
    installWebBootstrap(webBootstrap())
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => settingsSnapshotResponse({ theme: 'auto', colorTheme: 'default' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const eventListeners = new Set<(event: RpcEvent) => void>()
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    bridgeModule.setRendererBridgeForTests(
      electronBridge((cb) => {
        eventListeners.add(cb)
        return () => eventListeners.delete(cb)
      }),
    )

    const { useThemeStore } = await import('#/web/stores/theme.ts')
    await useThemeStore.getState().hydrate()
    const beforeNativeEventFetchCount = fetchMock.mock.calls.length

    for (const listener of eventListeners) {
      listener({
        type: 'theme-changed',
        state: { pref: 'auto', resolved: 'dark', colorTheme: 'github' },
      })
    }
    await flushAsyncWork()

    expect(fetchMock).toHaveBeenCalledTimes(beforeNativeEventFetchCount)
    expect(useThemeStore.getState()).toMatchObject({ pref: 'auto', resolved: 'dark', colorTheme: 'github' })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-color-theme')).toBe('github')
  })

  test('unknown settings invalidation scopes are ignored', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => settingsSnapshotResponse(),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { useSessionRestoreStore } = await import('#/web/stores/session-restore.ts')
    const { useThemeStore } = await import('#/web/stores/theme.ts')
    await useSessionRestoreStore.getState().hydrate()
    await useThemeStore.getState().hydrate()
    const beforeInvalidationFetchCount = fetchMock.mock.calls.length

    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['session'] })
    await flushAsyncWork()

    expect(fetchMock).toHaveBeenCalledTimes(beforeInvalidationFetchCount)
    expect(useSessionRestoreStore.getState().bootSessionSnapshot).toMatchObject({
      openRepos: [],
      activeRepo: null,
      workspaceLayout: 'left-right',
    })
    expect(useThemeStore.getState()).toMatchObject({ pref: 'auto', resolved: 'light', colorTheme: 'default' })
  })

  test('i18n store refetches payload only on i18n invalidation', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    let i18nReadCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => ({
        ok: true,
        json: async () => {
          if (input.endsWith('/api/settings/i18n')) {
            i18nReadCount++
            return i18nReadCount > 1
              ? { lang: 'ja', pref: 'ja', dict: { hello: 'こんにちは' } }
              : { lang: 'en', pref: 'auto', dict: { hello: 'hello' } }
          }
          throw new Error(`Unexpected fetch: ${input}`)
        },
      })),
    )

    const { useI18nStore } = await import('#/web/stores/i18n.ts')
    await useI18nStore.getState().hydrate()
    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['i18n'] })
    await waitUntil(() => {
      expect(useI18nStore.getState()).toMatchObject({ lang: 'ja', pref: 'ja', dict: { hello: 'こんにちは' } })
      expect(document.documentElement.getAttribute('lang')).toBe('ja')
    })
  })

  test('settings refetch subscription coalesces repeated invalidations while a fetch is in flight', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))

    const resolvers: Array<(value: number) => void> = []
    const apply = vi.fn()
    const fetch = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolvers.push(resolve)
        }),
    )

    const { subscribeSettingsInvalidationRefetch } = await import('#/web/settings-invalidation-refetch.ts')
    const dispose = subscribeSettingsInvalidationRefetch({
      scope: 'settings-snapshot',
      fetch,
      apply,
      label: 'test-sync',
    })

    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['settings-snapshot'] })
    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['settings-snapshot'] })
    latestSocket().emitMessage({ type: 'settings-invalidated', scopes: ['settings-snapshot'] })
    await flushAsyncWork()

    expect(fetch).toHaveBeenCalledTimes(1)

    const resolveFirstFetch = resolvers.shift()
    if (!resolveFirstFetch) throw new Error('Expected first fetch resolver')
    resolveFirstFetch(1)
    await waitUntil(() => {
      expect(apply).toHaveBeenCalledWith(1)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    const resolveSecondFetch = resolvers.shift()
    if (!resolveSecondFetch) throw new Error('Expected second fetch resolver')
    resolveSecondFetch(2)
    await waitUntil(() => {
      expect(apply).toHaveBeenNthCalledWith(2, 2)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    dispose()
  })
})
