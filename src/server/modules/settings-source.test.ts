import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultSessionState } from '#/shared/settings-defaults.ts'

let tmp: string | null = null
let previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR

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
    gitNetworkProxyEnabled: false,
    gitNetworkProxyUrl: '',
    gitNetworkTimeoutSec: 120,
    terminalNotificationsEnabled: false,
    shortcutsDisabled: false,
    globalShortcutDisabled: false,
    swapCloseShortcuts: false,
    toggleDetailOnActionBarBlankClick: false,
    terminalThemeSyncEnabled: true,
    temporaryFilesDirectory: '',
    globalShortcut: 'Alt+G',
    terminalApp: 'auto',
    editorApp: 'auto',
    fileTreeFontSize: 14,
    fileTreeTopbarFontSize: 13,
    terminalFontSize: 14,
    remoteTerminalTmuxEnabled: false,
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
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: true,
    globalShortcutDisabled: true,
    swapCloseShortcuts: true,
    toggleDetailOnActionBarBlankClick: true,
    terminalThemeSyncEnabled: false,
    temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
    globalShortcut: 'CommandOrControl+Alt+G',
    terminalApp: 'ghostty',
    editorApp: 'cursor',
    fileTreeFontSize: 13.4,
    fileTreeTopbarFontSize: 12.2,
    terminalFontSize: 15.6,
    remoteTerminalTmuxEnabled: true,
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
    gitNetworkProxyEnabled: true,
    gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    gitNetworkTimeoutSec: 240,
    terminalNotificationsEnabled: true,
    shortcutsDisabled: true,
    globalShortcutDisabled: true,
    swapCloseShortcuts: true,
    toggleDetailOnActionBarBlankClick: true,
    terminalThemeSyncEnabled: false,
    temporaryFilesDirectory: path.join(tmp, 'terminal-paste'),
    globalShortcut: 'Alt+G',
    terminalApp: 'ghostty',
    editorApp: 'cursor',
    fileTreeFontSize: 13,
    fileTreeTopbarFontSize: 12,
    terminalFontSize: 16,
    remoteTerminalTmuxEnabled: true,
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

test('normalizes invalid temporary file directories to the default project tmp mode', async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-server-settings-'))
  previousDataDir = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = tmp

  const mod = await import('#/server/modules/settings-source.ts')
  await mod.updateServerSettingsPrefs({
    temporaryFilesDirectory: ' relative/tmp ',
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
  for (const colorTheme of ['claude', 'cursor', 'airbnb', 'bmw'] as const) {
    await mod.updateServerSettingsPrefs({ colorTheme })
    expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme })
  }

  await mod.updateServerSettingsPrefs({ colorTheme: 'apple' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })

  await mod.updateServerSettingsPrefs({ colorTheme: 'not-a-theme' as never })
  expect(await mod.getServerSettingsPrefs()).toMatchObject({ colorTheme: 'macos' })
})
