import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'

const mocks = vi.hoisted(() => ({
  access: vi.fn(async () => undefined),
  readFile: vi.fn(
    async () => `<!doctype html>
<html lang="en">
  <head>
    <script type="module" src="./boot.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
  ),
  getServerSettingsPrefs: vi.fn(async () => ({
    lang: 'auto',
    theme: 'auto',
    colorTheme: 'macos',
    fetchIntervalSec: 120,
    terminalNotificationsEnabled: false,
    shortcutsDisabled: false,
    globalShortcutDisabled: false,
    swapCloseShortcuts: false,
    temporaryFilesDirectory: '',
    globalShortcut: 'CommandOrControl+Shift+G',
    terminalApp: 'auto',
    editorApp: 'auto',
    fileTreeFontSize: 12,
    terminalFontSize: 14,
    terminalCustomButtonsVisible: true,
    terminalCustomButtonSize: 'medium',
    terminalCustomButtons: [],
    lanEnabled: false,
  })),
  getServerWebAccessCredentials: vi.fn(async () => ({ enabled: false, username: '', passwordHash: '' })),
}))

const terminalHostStub = {
  isValidClientId: (_value: unknown): _value is string => true,
  getDiagnostics: vi.fn(() => ({
    mode: 'worker-backed' as const,
    state: 'running' as const,
    workerRunning: true,
    workerPid: 1,
    workerStartedAt: 1,
    workerUptimeMs: 1,
    pendingRequests: 0,
    registeredSockets: 0,
    restartAttempts: 0,
    restartScheduled: false,
    shuttingDown: false,
    lastSuccessfulResponseAt: 1,
    lastExitCode: null,
    lastExitSignal: null,
    lastWorkerFailure: null,
  })),
  registerSocket: vi.fn(),
  unregisterSocket: vi.fn(),
  attach: vi.fn(),
  restart: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  takeover: vi.fn(),
  close: vi.fn(),
  closeSessions: vi.fn(),
  notifyBell: vi.fn(),
  listSessions: vi.fn(),
  create: vi.fn(),
  prune: vi.fn(),
  getSessionSnapshot: vi.fn(),
  handleRealtimeMessage: vi.fn(),
  shutdown: vi.fn(),
} satisfies ServerTerminalHost

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  readFile: mocks.readFile,
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
  getServerWebAccessCredentials: mocks.getServerWebAccessCredentials,
}))

describe('server app html bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getServerWebAccessCredentials.mockResolvedValue({ enabled: false, username: '', passwordHash: '' })
  })

  test('injects bootstrap into the web index html for web requests', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request(
      new Request('http://127.0.0.1:32100/', {
        headers: {
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      }),
    )

    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(html).toContain('<script id="goblin-bootstrap" type="application/json">')
    expect(webCapabilityFromHtml(html)).not.toBe('secret')
    expect(webCapabilityFromHtml(html)).toMatch(/^[0-9a-f]{64}$/u)
    expect(html).toContain('"lang":"zh"')
    expect(html).toContain(`"hostPlatform":"${process.platform}"`)
    expect(html).toContain('打开本地仓库')
  }, 10_000)

  test('keeps browser terminal ownership aligned with Electron while capabilities differ', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const electronResponse = await app.request('http://127.0.0.1:32100/', {
      headers: { 'x-goblin-internal-secret': 'secret' },
    })
    const browserResponse = await app.request('http://127.0.0.1:32100/')
    const electronHtml = await electronResponse.text()
    const browserHtml = await browserResponse.text()
    const electronServer = serverBootstrapFromHtml(electronHtml)
    const browserServer = serverBootstrapFromHtml(browserHtml)

    expect(browserServer.secret).not.toBe(electronServer.secret)
    expect(browserServer.clientId).toBe(electronServer.clientId)
  })

  test('resolves auto language from the first supported accept-language candidate', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request(
      new Request('http://127.0.0.1:32100/', {
        headers: {
          'accept-language': 'fr-FR,ja;q=0.9,en;q=0.8',
        },
      }),
    )

    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('"lang":"ja"')
    expect(html).toContain('ローカルリポジトリを開く')
  })

  test('serves renderer html for settings routes', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    for (const path of ['/settings', '/settings/general']) {
      const response = await app.request(new Request(`http://127.0.0.1:32100${path}`))
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(html).toContain('<script id="goblin-bootstrap" type="application/json">')
      expect(webCapabilityFromHtml(html)).not.toBe('secret')
      expect(webCapabilityFromHtml(html)).toMatch(/^[0-9a-f]{64}$/u)
      expect(html).toContain('<base href="http://127.0.0.1:32100/">')
    }
  })

  test('redirects protected browser routes to login when Web access protection is enabled', async () => {
    mocks.getServerWebAccessCredentials.mockResolvedValue({
      enabled: true,
      username: 'operator',
      passwordHash:
        'scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',
    })
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request('http://127.0.0.1:32100/settings/security', {
      headers: { 'x-goblin-internal-secret': 'wrong-secret' },
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/auth/login?next=%2Fsettings%2Fsecurity')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('serves protected renderer html to Electron with the exact internal capability', async () => {
    mocks.getServerWebAccessCredentials.mockResolvedValue({
      enabled: true,
      username: 'operator',
      passwordHash:
        'scrypt$16384$8$1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',
    })
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request('http://127.0.0.1:32100/', {
      headers: { 'x-goblin-internal-secret': 'secret' },
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(webCapabilityFromHtml(html)).toBe('secret')
  })

  test('uses the authenticated Cookie capability in protected Web bootstrap', async () => {
    const { hashWebAccessPassword } = await import('#/server/modules/web-access-auth.ts')
    mocks.getServerWebAccessCredentials.mockResolvedValue({
      enabled: true,
      username: 'operator',
      passwordHash: await hashWebAccessPassword('test-password'),
    })
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })
    const login = await app.request('http://127.0.0.1:32100/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'operator', password: 'test-password', next: '/' }),
    })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]

    expect(login.status).toBe(303)
    expect(cookie).toMatch(/^goblin_web_session=/u)
    const response = await app.request('http://127.0.0.1:32100/', { headers: { cookie: cookie! } })
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(webCapabilityFromHtml(html)).toBe(cookie!.split('=')[1])
    expect(webCapabilityFromHtml(html)).not.toBe('secret')
  })

  test('marks api responses as non-cacheable', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request(new Request('http://127.0.0.1:32100/api/health'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('protects Telegram notification endpoints with the server capability', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request('http://127.0.0.1:32100/api/telegram-notifications/test', {
      method: 'POST',
    })
    expect(response.status).toBe(401)
  })

  test('protects tmux cleanup endpoints with the server capability', async () => {
    const { createApp } = await import('#/server/app-factory.ts')
    const app = createApp({
      version: '0.1.0',
      startedAt: Date.now(),
      internalSecret: 'secret',
      terminalHost: terminalHostStub,
    })

    const response = await app.request('http://127.0.0.1:32100/api/tmux-cleanup/preview', {
      method: 'POST',
    })
    expect(response.status).toBe(401)
  })
})

function serverBootstrapFromHtml(html: string): { secret: string; clientId: string } {
  const match = html.match(/<script id="goblin-bootstrap" type="application\/json">([^<]+)<\/script>/u)
  if (!match?.[1]) throw new Error('Missing renderer bootstrap')
  const bootstrap = JSON.parse(match[1]) as { initialServer?: { secret?: string; clientId?: string } }
  if (!bootstrap.initialServer?.secret) throw new Error('Missing Web capability')
  if (!bootstrap.initialServer.clientId) throw new Error('Missing terminal client id')
  return { secret: bootstrap.initialServer.secret, clientId: bootstrap.initialServer.clientId }
}

function webCapabilityFromHtml(html: string): string {
  return serverBootstrapFromHtml(html).secret
}
