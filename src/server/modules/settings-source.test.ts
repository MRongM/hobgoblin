import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultSessionState } from '#/shared/settings-defaults.ts'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { normalizeRemoteRepoRef, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'

let tmp: string | null = null
let previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR

function useTempServerSettingsDir(): void {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp
}

function writeSettingsFile(partial: Record<string, unknown>): void {
  if (!tmp) throw new Error('temporary settings directory was not initialized')
  writeFileSync(path.join(tmp, 'server-settings.json'), JSON.stringify(partial), 'utf-8')
}

function telegramSettingsUpdate(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    botToken: '',
    chatId: '',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
    ...overrides,
  }
}

afterEach(async () => {
  const mod = await import('#/server/modules/settings-source.ts')
  mod.resetServerSettingsSourceForTests()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = null
  if (previousDataDir === undefined) delete process.env.GOBLIN_SERVER_DATA_DIR
  else process.env.GOBLIN_SERVER_DATA_DIR = previousDataDir
  vi.resetModules()
})

test('initializes server-settings.json with defaults when no persisted settings exist', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  const sec = await mod.getServerFetchIntervalSec()

  expect(sec).toBe(120)
  const prefs = await mod.getServerSettingsPrefs()
  expect(prefs).toMatchObject({
    lang: 'auto',
    theme: 'auto',
    colorTheme: 'macos',
    fontFamily: 'mono',
    gitNetworkProxyEnabled: false,
    gitNetworkProxyUrl: '',
    gitNetworkTimeoutSec: 120,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: false,
    globalShortcutDisabled: false,
    swapCloseShortcuts: false,
    terminalThemeSyncEnabled: true,
    temporaryFilesDirectory: '',
    globalShortcut: 'Alt+G',
    terminalApp: 'auto',
    editorApp: 'auto',
    topbarHeightPx: 34,
    toolbarHeightPx: 34,
    fileTreeFontSize: 14,
    terminalFontSize: 14,
    terminalCustomButtonsVisible: true,
    terminalCustomButtonSize: 'medium',
    terminalCustomButtons: [],
    lanEnabled: false,
  })
  expect(await mod.getServerSessionState()).toMatchObject({
    openRepos: [],
    activeRepo: null,
  })
  expect(await mod.getServerRecentRepos()).toEqual([])
  mod.resetServerSettingsSourceForTests()
  vi.resetModules()
  const reloaded = await import('#/server/modules/settings-source.ts')
  expect(await reloaded.getServerFetchIntervalSec()).toBe(120)
})

test('retains the 30 most recently opened repositories', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  for (let index = 0; index <= 30; index += 1) {
    await mod.addServerRecentRepo({ kind: 'local', id: `/repo-${index}` })
  }

  expect(await mod.getServerRecentRepos()).toEqual(
    Array.from({ length: 30 }, (_, index) => ({ kind: 'local', id: `/repo-${30 - index}` })),
  )
})

test('defaults a missing terminal notification preference on and preserves explicit off', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({})
  const missingPreferenceModule = await import('#/server/modules/settings-source.ts')

  await expect(missingPreferenceModule.getServerSettingsPrefs()).resolves.toMatchObject({
    terminalNotificationsEnabled: true,
  })

  missingPreferenceModule.resetServerSettingsSourceForTests()
  vi.resetModules()
  writeSettingsFile({ terminalNotificationsEnabled: false })
  const explicitOptOutModule = await import('#/server/modules/settings-source.ts')

  await expect(explicitOptOutModule.getServerSettingsPrefs()).resolves.toMatchObject({
    terminalNotificationsEnabled: false,
  })
})

test('defaults missing Telegram completion activity duration to ten seconds', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({})
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
    outputCompletionMinimumActivitySeconds: 10,
  })
})

test('defaults a missing Telegram proxy preference on and persists explicit opt-out', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({})
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({ proxyEnabled: true })

  await mod.updateServerTelegramNotificationSettings(telegramSettingsUpdate({ proxyEnabled: false }))
  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({ proxyEnabled: false })

  mod.resetServerSettingsSourceForTests()
  vi.resetModules()
  const reloaded = await import('#/server/modules/settings-source.ts')
  await expect(reloaded.getServerTelegramNotificationSettings()).resolves.toMatchObject({ proxyEnabled: false })
})

test.each([0, 3_601, 1.5, Number.NaN, '10', null])(
  'normalizes corrupt persisted Telegram completion activity duration %p to ten seconds',
  async (persisted) => {
    useTempServerSettingsDir()
    writeSettingsFile({ telegramOutputCompletionMinimumActivitySeconds: persisted })
    const mod = await import('#/server/modules/settings-source.ts')

    await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
      outputCompletionMinimumActivitySeconds: 10,
    })
  },
)

test.each([1, 10, 30, 3_600])('persists valid Telegram completion activity duration %i', async (seconds) => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await mod.updateServerTelegramNotificationSettings(
    telegramSettingsUpdate({ outputCompletionMinimumActivitySeconds: seconds }),
  )

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({
    outputCompletionMinimumActivitySeconds: seconds,
  })
})

test.each([0, 3_601, 1.5, Number.NaN])('rejects invalid Telegram completion activity duration %p', async (seconds) => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerTelegramNotificationSettings(
      telegramSettingsUpdate({ outputCompletionMinimumActivitySeconds: seconds }),
    ),
  ).rejects.toMatchObject({ code: 'invalid-input' })
})

test('keeps Telegram Bot Token server-only and retains it on a blank update', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: true,
      botToken: '123456:test-token-value',
      chatId: '-1001234567890',
      bellEnabled: false,
      outputCompletionEnabled: true,
      outputCompletionMinimumActivitySeconds: 30,
      includeTerminalOutput: true,
      outputTailLength: 4096,
    }),
  ).resolves.toEqual({
    enabled: true,
    botTokenConfigured: true,
    chatId: '-1001234567890',
    proxyEnabled: true,
    bellEnabled: false,
    outputCompletionEnabled: true,
    outputCompletionMinimumActivitySeconds: 30,
    includeTerminalOutput: true,
    outputTailLength: 4096,
  })

  expect(JSON.stringify(await mod.getServerTelegramNotificationSettings())).not.toContain('test-token-value')

  await mod.updateServerTelegramNotificationSettings({
    enabled: false,
    botToken: '',
    chatId: '-1001234567890',
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 200,
  })
  expect((await mod.getServerTelegramNotificationConfig()).botToken).toBe('123456:test-token-value')
})

test('does not enable Telegram notifications without a Bot Token and Chat ID', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: true,
      botToken: '',
      chatId: '',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 400,
    }),
  ).rejects.toMatchObject({ code: 'configuration-incomplete' })

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toEqual({
    enabled: false,
    botTokenConfigured: false,
    chatId: '',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
  })
})

test('normalizes persisted Telegram output length and rejects invalid writes', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({ telegramOutputTailLength: 9000 })
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toMatchObject({ outputTailLength: 4096 })
  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: false,
      chatId: '',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 0,
    }),
  ).rejects.toMatchObject({ code: 'invalid-input' })
  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: false,
      chatId: '',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 1.5,
    }),
  ).rejects.toMatchObject({ code: 'invalid-input' })

  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: false,
      chatId: '',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 1,
    }),
  ).resolves.toMatchObject({ outputTailLength: 1 })

  mod.resetServerSettingsSourceForTests()
  vi.resetModules()
  const reloaded = await import('#/server/modules/settings-source.ts')
  await expect(reloaded.getServerTelegramNotificationSettings()).resolves.toMatchObject({ outputTailLength: 1 })
})

test('tracks a saved Bot Token independently from the Chat ID while disabled', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: false,
      botToken: '123456:test-token',
      chatId: '',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 200,
    }),
  ).resolves.toEqual({
    enabled: false,
    botTokenConfigured: true,
    chatId: '',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 200,
  })
  expect((await mod.getServerTelegramNotificationConfig()).botToken).toBe('123456:test-token')
})

test('rejects malformed Telegram channel usernames', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerTelegramNotificationSettings({
      enabled: false,
      botToken: '123456:test-token',
      chatId: '@1starts_with_digit',
      bellEnabled: true,
      outputCompletionEnabled: false,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: false,
      outputTailLength: 200,
    }),
  ).rejects.toMatchObject({ code: 'invalid-input' })
})

test('normalizes missing and invalid persisted Telegram notification settings', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    telegramNotificationsEnabled: true,
    telegramOutputTailLength: 'invalid',
    telegramBotToken: 'token\u0000material',
    telegramChatId: 'invalid chat id',
  })
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toEqual({
    enabled: false,
    botTokenConfigured: false,
    chatId: '',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
  })
  expect(JSON.stringify(await mod.getServerSettingsPrefs())).not.toContain('telegramBotToken')
})

test('migrates legacy Telegram settings to bell-only delivery', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    telegramNotificationsEnabled: true,
    telegramBotToken: '123456:test-token',
    telegramChatId: '-100123',
  })
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerTelegramNotificationSettings()).resolves.toEqual({
    enabled: true,
    botTokenConfigured: true,
    chatId: '-100123',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
  })
})

test('discards persisted tmux preferences from normalized settings', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    localTerminalTmuxEnabled: true,
    remoteTerminalTmuxEnabled: true,
    internalTerminalTmuxEnabled: true,
  })
  const mod = await import('#/server/modules/settings-source.ts')

  const prefs = await mod.getServerSettingsPrefs()

  expect(prefs).not.toHaveProperty('localTerminalTmuxEnabled')
  expect(prefs).not.toHaveProperty('remoteTerminalTmuxEnabled')
  expect(prefs).not.toHaveProperty('internalTerminalTmuxEnabled')

  const persisted = JSON.parse(readFileSync(path.join(tmp!, 'server-settings.json'), 'utf-8'))
  expect(persisted).not.toHaveProperty('localTerminalTmuxEnabled')
  expect(persisted).not.toHaveProperty('remoteTerminalTmuxEnabled')
  expect(persisted).not.toHaveProperty('internalTerminalTmuxEnabled')
})

test('persists web access credentials without exposing password material in public settings', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.updateServerWebAccessSettings({
      enabled: true,
      username: 'operator',
      password: 'test-password',
    }),
  ).resolves.toEqual({ enabled: true, username: 'operator', passwordConfigured: true })

  const persisted = readFileSync(path.join(tmp!, 'server-settings.json'), 'utf-8')
  expect(persisted).not.toContain('test-password')
  expect(JSON.parse(persisted)).toMatchObject({
    webAccessEnabled: true,
    webAccessUsername: 'operator',
    webAccessPasswordHash: expect.stringMatching(/^scrypt\$/u),
  })
  await expect(mod.getServerWebAccessSettings()).resolves.toEqual({
    enabled: true,
    username: 'operator',
    passwordConfigured: true,
  })
  expect(JSON.stringify(await mod.getServerSettingsPrefs())).not.toContain('webAccessPasswordHash')
})

test('retains configured credentials safely and requires a password when the username changes', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await mod.updateServerWebAccessSettings({
    enabled: true,
    username: 'operator',
    password: 'test-password',
  })
  const originalHash = JSON.parse(readFileSync(path.join(tmp!, 'server-settings.json'), 'utf-8')).webAccessPasswordHash

  await expect(mod.updateServerWebAccessSettings({ enabled: true, username: 'operator' })).resolves.toEqual({
    enabled: true,
    username: 'operator',
    passwordConfigured: true,
  })
  expect(JSON.parse(readFileSync(path.join(tmp!, 'server-settings.json'), 'utf-8')).webAccessPasswordHash).toBe(
    originalHash,
  )

  await expect(
    mod.updateServerWebAccessSettings({ enabled: true, username: 'another-operator' }),
  ).rejects.toMatchObject({ code: 'password-required' })
  await expect(
    mod.updateServerWebAccessSettings({ enabled: true, username: 'operator', password: 'short' }),
  ).rejects.toMatchObject({ code: 'password-too-short' })

  await expect(mod.updateServerWebAccessSettings({ enabled: false, username: 'operator' })).resolves.toEqual({
    enabled: false,
    username: 'operator',
    passwordConfigured: true,
  })
  expect(JSON.parse(readFileSync(path.join(tmp!, 'server-settings.json'), 'utf-8')).webAccessPasswordHash).toBe(
    originalHash,
  )
})

test('normalizes incomplete persisted web access credentials to disabled and unconfigured', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({
    webAccessEnabled: true,
    webAccessUsername: 'operator',
    webAccessPasswordHash: 'not-a-valid-hash',
  })
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(mod.getServerWebAccessSettings()).resolves.toEqual({
    enabled: false,
    username: '',
    passwordConfigured: false,
  })
})

test('persists updates and notifies subscribers from the server settings store', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  const listener = vi.fn()
  const unsubscribe = mod.subscribeServerFetchInterval(listener)

  const sec = await mod.setServerFetchIntervalSec(42)
  await mod.updateServerSettingsPrefs({
    lang: 'ko',
    theme: 'dark',
    colorTheme: 'github',
    fontFamily: 'maple',
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: true,
    globalShortcutDisabled: true,
    swapCloseShortcuts: true,
    terminalThemeSyncEnabled: false,
    temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
    globalShortcut: 'CommandOrControl+Alt+G',
    terminalApp: 'ghostty',
    editorApp: 'cursor',
    topbarHeightPx: 41.2,
    toolbarHeightPx: 42.8,
    fileTreeFontSize: 13.4,
    terminalFontSize: 15.6,
    terminalCustomButtonsVisible: false,
    terminalCustomButtonSize: 'large',
    terminalCustomButtons: [
      { label: ' status ', value: ' git status --short\n', action: 'input' },
      { label: '', value: 'ignored', action: 'execute' },
      { label: 'empty', value: '   ', action: 'input' },
      { label: 'test', value: 'bun run test', action: 'bad-value' as never },
    ],
    lanEnabled: false,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & { terminalCustomButtonSize: string })
  await mod.setServerSessionState({
    ...defaultSessionState(),
    openRepos: [{ kind: 'local', id: '/repo-b' }],
    activeRepo: '/repo-b',
    selectedTerminalByWorktree: { '/repo-b\0/worktree': '/repo-b\0/worktree\0terminal-2' },
  })
  await mod.addServerRecentRepo({ kind: 'local', id: '/repo-b' })
  unsubscribe()

  expect(sec).toBe(42)
  expect(listener).toHaveBeenCalledWith(42)
  mod.resetServerSettingsSourceForTests()
  vi.resetModules()
  const reloaded = await import('#/server/modules/settings-source.ts')
  expect(await reloaded.getServerFetchIntervalSec()).toBe(42)
  const reloadedPrefs = await reloaded.getServerSettingsPrefs()
  expect(reloadedPrefs).toMatchObject({
    lang: 'ko',
    theme: 'dark',
    colorTheme: 'github',
    fontFamily: 'maple',
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: true,
    globalShortcutDisabled: true,
    swapCloseShortcuts: true,
    terminalThemeSyncEnabled: false,
    temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
    globalShortcut: 'Alt+G',
    terminalApp: 'ghostty',
    editorApp: 'cursor',
    topbarHeightPx: 41,
    toolbarHeightPx: 43,
    fileTreeFontSize: 13,
    terminalFontSize: 16,
    terminalCustomButtonsVisible: false,
    terminalCustomButtonSize: 'large',
    terminalCustomButtons: [
      { label: 'status', value: ' git status --short\n', action: 'input' },
      { label: 'test', value: 'bun run test', action: 'execute' },
    ],
    lanEnabled: false,
  })
  expect(await reloaded.getServerSessionState()).toMatchObject({
    openRepos: [{ kind: 'local', id: '/repo-b' }],
    activeRepo: '/repo-b',
    selectedTerminalByWorktree: { '/repo-b\0/worktree': '/repo-b\0/worktree\0terminal-2' },
  })
  expect(await reloaded.getServerRecentRepos()).toEqual([{ kind: 'local', id: '/repo-b' }])
})

test('persists a custom server port and normalizes invalid values to the default', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  expect((await mod.getServerSettingsPrefs()).serverPort).toBe(32200)

  await mod.updateServerSettingsPrefs({ serverPort: 33001 })
  expect((await mod.getServerSettingsPrefs()).serverPort).toBe(33001)

  await mod.updateServerSettingsPrefs({ serverPort: 80 })
  expect((await mod.getServerSettingsPrefs()).serverPort).toBe(32200)

  await mod.updateServerSettingsPrefs({ serverPort: Number.NaN })
  expect((await mod.getServerSettingsPrefs()).serverPort).toBe(32200)
})

test('normalizes persisted out-of-range server ports to the default on load', async () => {
  useTempServerSettingsDir()
  writeSettingsFile({ serverPort: 70000 })
  const mod = await import('#/server/modules/settings-source.ts')
  expect((await mod.getServerSettingsPrefs()).serverPort).toBe(32200)
})

test('normalizes configurable chrome heights', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    topbarHeightPx: 12,
    toolbarHeightPx: 99,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    topbarHeightPx: number
    toolbarHeightPx: number
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    topbarHeightPx: 30,
    toolbarHeightPx: 48,
  })

  await mod.updateServerSettingsPrefs({
    topbarHeightPx: 'large' as never,
    toolbarHeightPx: Number.NaN,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    topbarHeightPx: unknown
    toolbarHeightPx: unknown
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    topbarHeightPx: 34,
    toolbarHeightPx: 34,
  })
})

test('normalizes invalid git network proxy and clamps timeout seconds', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'ftp://127.0.0.1:21',
    gitNetworkTimeoutSec: 9999,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    gitNetworkProxyUrl: string
    gitNetworkTimeoutSec: number
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: '',
    gitNetworkTimeoutSec: 900,
  })

  await mod.updateServerSettingsPrefs({
    gitNetworkProxyUrl: ' socks5://127.0.0.1:7890 ',
    gitNetworkTimeoutSec: 1,
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & {
    gitNetworkProxyUrl: string
    gitNetworkTimeoutSec: number
  })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 15,
  })
})

test('normalizes global font family preferences', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ fontFamily: 'system' })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'system' })

  await mod.updateServerSettingsPrefs({ fontFamily: 'maple' })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'maple' })

  await mod.updateServerSettingsPrefs({ fontFamily: 'bad-value' as never })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fontFamily: 'mono' })
})

test('normalizes missing and invalid terminal theme sync values to enabled', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ terminalThemeSyncEnabled: 'bad-value' as never })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    terminalThemeSyncEnabled: true,
  })
})

test('normalizes safe relative temporary file directories', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    temporaryFilesDirectory: ' tmp/cache ',
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & { temporaryFilesDirectory: string })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    temporaryFilesDirectory: 'tmp/cache',
  })
})

test('normalizes unsafe relative temporary file directories to the default project tmp mode', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    temporaryFilesDirectory: '../cache',
  } as Parameters<typeof mod.updateServerSettingsPrefs>[0] & { temporaryFilesDirectory: string })

  expect(await mod.getServerSettingsPrefs()).toMatchObject({
    temporaryFilesDirectory: '',
  })
})

test('normalizes file tree clipboard max bytes setting', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: 250 })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 100 })

  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: -5 })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 1 })

  await mod.updateServerSettingsPrefs({ fileTreeClipboardMaxBytesMb: 'large' as never })
  await expect(mod.getServerSettingsPrefs()).resolves.toMatchObject({ fileTreeClipboardMaxBytesMb: 30 })
})

test('limits persisted terminal custom buttons to 20 valid entries', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    terminalCustomButtons: Array.from({ length: 25 }, (_, index) => ({
      label: `button-${index}`,
      value: `echo ${index}`,
    })),
  })

  const prefs = await mod.getServerSettingsPrefs()
  expect(prefs.terminalCustomButtons).toHaveLength(20)
  expect(prefs.terminalCustomButtons[0]).toEqual({ label: 'button-0', value: 'echo 0', action: 'execute' })
  expect(prefs.terminalCustomButtons[19]).toEqual({ label: 'button-19', value: 'echo 19', action: 'execute' })
})

test('accepts current design color themes and normalizes legacy apple plus unknown presets', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  for (const colorTheme of COLOR_THEMES) {
    await mod.updateServerSettingsPrefs({ colorTheme })
    expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme })
  }

  await mod.updateServerSettingsPrefs({ colorTheme: 'apple' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })

  await mod.updateServerSettingsPrefs({ colorTheme: 'not-a-theme' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })
})

test('trusts and untrusts a repo worktree bootstrap config hash', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const configHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  await mod.trustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })
  await expect(mod.getServerRepoSettings()).resolves.toEqual([
    {
      repoId: '/repo-a',
      worktreeBootstrapTrust: {
        configHash,
        trustedAt: expect.any(String),
      },
    },
  ])

  await expect(mod.untrustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })).resolves.toBe(true)
  await expect(mod.getServerRepoSettings()).resolves.toEqual([])
})

test('drops invalid persisted worktree bootstrap trust entries', async () => {
  useTempServerSettingsDir()
  await writeSettingsFile({
    repoSettings: [
      {
        repoId: '/repo-a',
        worktreeBootstrapTrust: { configHash: 'sha256:bad', trustedAt: '2026-07-08T00:00:00.000Z' },
      },
      {
        repoId: '/repo-b',
        worktreeBootstrapTrust: {
          configHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          trustedAt: 123,
        },
      },
      {
        repoId: '/repo-c',
        worktreeBootstrapTrust: {
          configHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          trustedAt: '2026-07-08T00:00:00.000Z',
        },
      },
    ],
  })

  const mod = await import('#/server/modules/settings-source.ts')
  await expect(mod.getServerRepoSettings()).resolves.toEqual([
    {
      repoId: '/repo-c',
      worktreeBootstrapTrust: {
        configHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        trustedAt: '2026-07-08T00:00:00.000Z',
      },
    },
  ])
})

test('normalizes persisted project color themes and drops invalid project color themes', async () => {
  useTempServerSettingsDir()
  await writeSettingsFile({
    repoSettings: [
      { repoId: '/repo-a', colorTheme: 'tokyo-night' },
      { repoId: '/repo-b', colorTheme: 'apple' },
      { repoId: '/repo-c', colorTheme: 'not-a-theme' },
      {
        repoId: '/repo-d',
        colorTheme: 'github',
        worktreeBootstrapTrust: {
          configHash: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          trustedAt: '2026-07-08T00:00:00.000Z',
        },
      },
    ],
  })

  const mod = await import('#/server/modules/settings-source.ts')
  await expect(mod.getServerRepoSettings()).resolves.toEqual([
    { repoId: '/repo-a', colorTheme: 'tokyo-night' },
    {
      repoId: '/repo-d',
      colorTheme: 'github',
      worktreeBootstrapTrust: {
        configHash: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        trustedAt: '2026-07-08T00:00:00.000Z',
      },
    },
  ])
})

test('sets and clears project color themes while preserving bootstrap trust', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const configHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  await mod.trustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })
  await mod.setServerRepoColorTheme({ repoId: '/repo-a', colorTheme: 'cursor' })
  await expect(mod.getServerRepoSettings()).resolves.toEqual([
    {
      repoId: '/repo-a',
      colorTheme: 'cursor',
      worktreeBootstrapTrust: { configHash, trustedAt: expect.any(String) },
    },
  ])

  await mod.setServerRepoColorTheme({ repoId: '/repo-a', colorTheme: null })
  await expect(mod.getServerRepoSettings()).resolves.toEqual([
    {
      repoId: '/repo-a',
      worktreeBootstrapTrust: { configHash, trustedAt: expect.any(String) },
    },
  ])

  await expect(mod.untrustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })).resolves.toBe(true)
  await expect(mod.getServerRepoSettings()).resolves.toEqual([])
})

test('ignores invalid project color theme writes', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await mod.setServerRepoColorTheme({ repoId: '/repo-a', colorTheme: 'cursor' })
  await mod.setServerRepoColorTheme({ repoId: '/repo-a', colorTheme: 'not-a-theme' as never })
  await mod.setServerRepoColorTheme({ repoId: '', colorTheme: 'github' })

  await expect(mod.getServerRepoSettings()).resolves.toEqual([{ repoId: '/repo-a', colorTheme: 'cursor' }])
})

test('untrusting bootstrap config preserves project color theme', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const configHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  await mod.trustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })
  await mod.setServerRepoColorTheme({ repoId: '/repo-a', colorTheme: 'cursor' })

  await expect(mod.untrustServerRepoWorktreeBootstrapConfig({ repoId: '/repo-a', configHash })).resolves.toBe(true)
  await expect(mod.getServerRepoSettings()).resolves.toEqual([{ repoId: '/repo-a', colorTheme: 'cursor' }])
})

test('persists file tree pane sizes through session save and reload', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  const saved = await mod.setServerSessionState({
    ...defaultSessionState(),
    fileTreePaneSizes: { 'left-right': 32.5 },
  })
  expect(saved.fileTreePaneSizes).toEqual({ 'left-right': 32.5 })

  await expect(mod.getServerSessionState()).resolves.toMatchObject({
    fileTreePaneSizes: { 'left-right': 32.5 },
  })
})

test('persists and normalizes workspace-specific repository list heights', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = '/tmp/workspace'

  const saved = await mod.setServerSessionState({
    ...defaultSessionState(),
    openRepos: [{ kind: 'local', id: root }],
    activeRepo: root,
    workspaceRepositoryListHeightByRoot: {
      [root]: 212.4,
      '/tmp/closed-workspace': 240,
    },
  } as never)
  expect(saved.workspaceRepositoryListHeightByRoot).toEqual({ [root]: 212 })
  await expect(mod.getServerSessionState()).resolves.toMatchObject({
    workspaceRepositoryListHeightByRoot: { [root]: 212 },
  })

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      workspaceRepositoryListHeightByRoot: { [root]: 0 },
    } as never),
  ).resolves.toMatchObject({ workspaceRepositoryListHeightByRoot: { [root]: 96 } })

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      workspaceRepositoryListHeightByRoot: { [root]: 10_000 },
    } as never),
  ).resolves.toMatchObject({ workspaceRepositoryListHeightByRoot: { [root]: 4096 } })

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      workspaceRepositoryListHeightByRoot: { [root]: 'invalid' },
    } as never),
  ).resolves.toMatchObject({ workspaceRepositoryListHeightByRoot: {} })
})

test('normalizes legacy top-bottom sessions to left-right without restoring terminal focus', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  const saved = await mod.setServerSessionState({
    ...defaultSessionState(),
    workspaceLayout: 'top-bottom',
    detailCollapsed: true,
    detailFocusMode: true,
    detailPaneSizes: { 'top-bottom': 40, 'left-right': 72 },
    fileTreePaneSizes: { 'top-bottom': 40, 'left-right': 64 },
  } as never)

  expect(saved).toMatchObject({
    workspaceLayout: 'left-right',
    detailCollapsed: false,
    detailFocusMode: false,
    detailPaneSizes: { 'left-right': 72 },
    fileTreePaneSizes: { 'left-right': 64 },
  })
})

test('persists and normalizes the global project list expansion preference', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      projectListExpanded: true,
    }),
  ).resolves.toMatchObject({ projectListExpanded: true })

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      projectListExpanded: 'invalid' as never,
    }),
  ).resolves.toMatchObject({ projectListExpanded: false })
})

test('migrates an active child repository for an open multi-repository workspace root', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = '/tmp/workspace'
  const child = '/tmp/workspace/api'

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      activeRepo: child,
      workspaceActiveRepoByRoot: { [root]: child },
    }),
  ).resolves.toMatchObject({
    activeRepo: child,
    workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
  })
})

test('preserves the active project when one repository is also an open workspace member', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = '/tmp/workspace'
  const child = '/tmp/workspace/api'

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [
        { kind: 'local', id: root },
        { kind: 'local', id: child },
      ],
      activeRepo: child,
      activeProject: root,
      workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
    }),
  ).resolves.toMatchObject({
    activeRepo: child,
    activeProject: root,
    workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
  })
})

test('migrates an active child repository for an open remote workspace root', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = normalizeRemoteRepoRef({ alias: 'example', remotePath: '/srv/workspace' })!
  const child = normalizeRemoteRepoRef({ alias: 'example', remotePath: '/srv/workspace/api' })!

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [remoteRepoSessionEntry(root)],
      activeRepo: child.id,
      workspaceActiveRepoByRoot: { [root.id]: child.id },
    }),
  ).resolves.toMatchObject({
    activeRepo: child.id,
    workspaceActiveContextByRoot: { [root.id]: { kind: 'repository', repositoryId: child.id } },
  })
})

test('drops workspace selections that are not immediate children of an open local root', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = '/tmp/workspace'

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      activeRepo: '/tmp/workspace/nested/api',
      workspaceActiveRepoByRoot: {
        [root]: '/tmp/workspace/nested/api',
        '/tmp/closed': '/tmp/closed/api',
      },
    }),
  ).resolves.toMatchObject({
    activeRepo: null,
    workspaceActiveContextByRoot: {},
  })
})

test('normalizes tagged workspace contexts and prunes per-root expansion state', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')
  const root = '/tmp/workspace'

  await expect(
    mod.setServerSessionState({
      ...defaultSessionState(),
      openRepos: [{ kind: 'local', id: root }],
      workspaceActiveContextByRoot: {
        [root]: {
          kind: 'branch-workspace',
          branchWorkspaceId: 'branch-1',
          memberRepositoryName: 'web',
        },
        '/tmp/closed': { kind: 'overview' },
      },
      workspaceRepositoryListExpandedByRoot: {
        [root]: false,
        '/tmp/closed': false,
      },
    }),
  ).resolves.toMatchObject({
    workspaceActiveContextByRoot: {
      [root]: {
        kind: 'branch-workspace',
        branchWorkspaceId: 'branch-1',
        memberRepositoryName: 'web',
      },
    },
    workspaceRepositoryListExpandedByRoot: { [root]: false },
  })
})

test('normalizes missing or invalid file tree pane sizes to defaults', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  const session = defaultSessionState()
  delete session.fileTreePaneSizes
  const saved = await mod.setServerSessionState(session)
  expect(saved.fileTreePaneSizes).toEqual({ 'left-right': 66.7 })
})
