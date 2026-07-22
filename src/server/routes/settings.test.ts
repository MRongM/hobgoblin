import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createServerSettingsState } from '#/server/modules/settings-state.ts'

const mocks = vi.hoisted(() => ({
  getServerExternalAppsSnapshot: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  getServerSettingsPrefs: vi.fn(),
  applyServerFetchIntervalWrite: vi.fn(),
  applyServerGlobalShortcutRegistrationWrite: vi.fn(),
  applyServerRecentRepoAddWrite: vi.fn(),
  applyServerRecentRepoClearWrite: vi.fn(),
  applyServerRepoThemeWrite: vi.fn(),
  applyServerSessionWrite: vi.fn(),
  applyServerSettingsPrefsWrite: vi.fn(),
  applyServerWebAccessSettingsWrite: vi.fn(),
  applyServerTelegramNotificationSettingsWrite: vi.fn(),
}))

vi.mock('#/server/modules/external-apps.ts', () => ({
  getServerExternalAppsSnapshot: mocks.getServerExternalAppsSnapshot,
}))

vi.mock('#/server/modules/settings-snapshot.ts', () => ({
  getSettingsSnapshot: mocks.getSettingsSnapshot,
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
}))

vi.mock('#/server/modules/settings-write-paths.ts', () => ({
  applyServerFetchIntervalWrite: mocks.applyServerFetchIntervalWrite,
  applyServerGlobalShortcutRegistrationWrite: mocks.applyServerGlobalShortcutRegistrationWrite,
  applyServerRecentRepoAddWrite: mocks.applyServerRecentRepoAddWrite,
  applyServerRecentRepoClearWrite: mocks.applyServerRecentRepoClearWrite,
  applyServerRepoThemeWrite: mocks.applyServerRepoThemeWrite,
  applyServerSessionWrite: mocks.applyServerSessionWrite,
  applyServerSettingsPrefsWrite: mocks.applyServerSettingsPrefsWrite,
  applyServerWebAccessSettingsWrite: mocks.applyServerWebAccessSettingsWrite,
  applyServerTelegramNotificationSettingsWrite: mocks.applyServerTelegramNotificationSettingsWrite,
}))

describe('settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('reports the Hobgoblin default server port when no override is configured', async () => {
    const previousHost = process.env.GOBLIN_SERVER_HOST
    const previousPort = process.env.GOBLIN_SERVER_PORT
    delete process.env.GOBLIN_SERVER_HOST
    delete process.env.GOBLIN_SERVER_PORT
    try {
      const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
      const app = createSettingsRoutes(createServerSettingsState())
      const response = await app.request(new Request('http://127.0.0.1:32200/lan'))

      await expect(response.json()).resolves.toMatchObject({
        host: '127.0.0.1',
        port: 32200,
        lanUrls: [],
      })
    } finally {
      if (previousHost === undefined) delete process.env.GOBLIN_SERVER_HOST
      else process.env.GOBLIN_SERVER_HOST = previousHost
      if (previousPort === undefined) delete process.env.GOBLIN_SERVER_PORT
      else process.env.GOBLIN_SERVER_PORT = previousPort
    }
  })

  test('delegates prefs writes to the settings write-path application layer', async () => {
    mocks.applyServerSettingsPrefsWrite.mockResolvedValue({
      ok: true,
      settings: { lang: 'ja' },
      i18n: { lang: 'ja', pref: 'ja', dict: {} },
    })

    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState())
    const response = await app.request(
      new Request('http://127.0.0.1:32100/prefs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-language': 'ja-JP,ja;q=0.9,en;q=0.8',
        },
        body: JSON.stringify({ settings: { lang: 'ja' } }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: { lang: 'ja' },
      i18n: { lang: 'ja', pref: 'ja', dict: {} },
    })
    expect(mocks.applyServerSettingsPrefsWrite).toHaveBeenCalledWith(
      { settings: { lang: 'ja' } },
      { acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.8', signal: expect.any(AbortSignal) },
    )
  })

  test('delegates session writes to the settings write-path application layer', async () => {
    const session = {
      openRepos: [],
      activeRepo: null,
      detailCollapsed: false,
      detailFocusMode: false,
      workspaceLayout: 'left-right',
      detailPaneSizes: {
        'left-right': 50,
      },
      selectedTerminalByWorktree: {},
    } as const
    mocks.applyServerSessionWrite.mockResolvedValue({ ok: true, session })

    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState())
    const response = await app.request(
      new Request('http://127.0.0.1:32100/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      ok: true,
      session,
    })
    expect(mocks.applyServerSessionWrite).toHaveBeenCalledWith({ session })
  })

  test('delegates Telegram settings writes without exposing the Bot Token', async () => {
    mocks.applyServerTelegramNotificationSettingsWrite.mockResolvedValue({
      ok: true,
      telegramNotifications: { enabled: true, botTokenConfigured: true, chatId: '-100123' },
    })
    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState())
    const response = await app.request('http://127.0.0.1:32100/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, botToken: '123456:test-token', chatId: '-100123' }),
    })

    const result = await response.json()
    expect(result).toEqual({
      ok: true,
      telegramNotifications: { enabled: true, botTokenConfigured: true, chatId: '-100123' },
    })
    expect(JSON.stringify(result)).not.toContain('test-token')
    expect(mocks.applyServerTelegramNotificationSettingsWrite).toHaveBeenCalledWith({
      enabled: true,
      botToken: '123456:test-token',
      chatId: '-100123',
    })
  })

  test('delegates recent-repo writes to the settings write-path application layer', async () => {
    const repo = { kind: 'local', id: '/tmp/repo-a' } as const
    mocks.applyServerRecentRepoAddWrite.mockResolvedValue({ ok: true, recentRepos: [repo], addedRepo: repo })
    mocks.applyServerRecentRepoClearWrite.mockResolvedValue({ ok: true })
    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState())

    const addResponse = await app.request(
      new Request('http://127.0.0.1:32100/recent-repos/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo }),
      }),
    )
    await expect(addResponse.json()).resolves.toEqual({
      ok: true,
      recentRepos: [repo],
      addedRepo: repo,
    })
    expect(mocks.applyServerRecentRepoAddWrite).toHaveBeenCalledWith({ repo })

    const clearResponse = await app.request(
      new Request('http://127.0.0.1:32100/recent-repos/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    await expect(clearResponse.json()).resolves.toEqual({ ok: true })
    expect(mocks.applyServerRecentRepoClearWrite).toHaveBeenCalled()
  })

  test('delegates project theme writes to the settings write-path application layer', async () => {
    const repoSettings = [{ repoId: '/tmp/repo-a', colorTheme: 'cursor' }] as const
    mocks.applyServerRepoThemeWrite
      .mockResolvedValueOnce({ ok: true, repoSettings })
      .mockResolvedValueOnce({ ok: true, repoSettings: [] })
    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState())
    const response = await app.request(
      new Request('http://127.0.0.1:32100/repo-theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId: '/tmp/repo-a', colorTheme: 'cursor' }),
      }),
    )

    await expect(response.json()).resolves.toEqual({ ok: true, repoSettings })
    expect(mocks.applyServerRepoThemeWrite).toHaveBeenNthCalledWith(1, {
      repoId: '/tmp/repo-a',
      colorTheme: 'cursor',
    })

    const clearResponse = await app.request(
      new Request('http://127.0.0.1:32100/repo-theme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoId: '/tmp/repo-a', colorTheme: null }),
      }),
    )

    await expect(clearResponse.json()).resolves.toEqual({ ok: true, repoSettings: [] })
    expect(mocks.applyServerRepoThemeWrite).toHaveBeenNthCalledWith(2, {
      repoId: '/tmp/repo-a',
      colorTheme: null,
    })
  })

  test('delegates Web access writes with session revocation', async () => {
    const webAccess = { enabled: true, username: 'operator', passwordConfigured: true }
    const revokeAllWebSessions = vi.fn()
    mocks.applyServerWebAccessSettingsWrite.mockResolvedValue({ ok: true, webAccess })
    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState(), { revokeAllWebSessions })

    const response = await app.request('/web-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, username: 'operator', password: 'test-password' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, webAccess })
    expect(mocks.applyServerWebAccessSettingsWrite).toHaveBeenCalledWith(
      { enabled: true, username: 'operator', password: 'test-password' },
      { revokeAllWebSessions },
    )
  })

  test('returns stable Web access validation errors as HTTP 400', async () => {
    const error = Object.assign(new Error('password-too-short'), { code: 'password-too-short' })
    mocks.applyServerWebAccessSettingsWrite.mockRejectedValue(error)
    const { createSettingsRoutes } = await import('#/server/routes/settings.ts')
    const app = createSettingsRoutes(createServerSettingsState(), { revokeAllWebSessions: vi.fn() })

    const response = await app.request('/web-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true, username: 'operator', password: 'short' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'password-too-short' },
    })
  })
})
