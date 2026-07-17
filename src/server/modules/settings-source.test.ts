import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultSessionState } from '#/shared/settings-defaults.ts'
import { COLOR_THEMES } from '#/shared/color-theme.ts'

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
    topbarHeightPx: 34,
    toolbarHeightPx: 34,
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
    fontFamily: 'maple',
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
    topbarHeightPx: 41.2,
    toolbarHeightPx: 42.8,
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
    fontFamily: 'maple',
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
    topbarHeightPx: 41,
    toolbarHeightPx: 43,
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
    fileTreePaneSizes: { 'top-bottom': 40, 'left-right': 32.5 },
  })
  expect(saved.fileTreePaneSizes).toEqual({ 'top-bottom': 40, 'left-right': 32.5 })

  await expect(mod.getServerSessionState()).resolves.toMatchObject({
    fileTreePaneSizes: { 'top-bottom': 40, 'left-right': 32.5 },
  })
})

test('normalizes missing or invalid file tree pane sizes to defaults', async () => {
  useTempServerSettingsDir()
  const mod = await import('#/server/modules/settings-source.ts')

  const session = defaultSessionState()
  delete session.fileTreePaneSizes
  const saved = await mod.setServerSessionState(session)
  expect(saved.fileTreePaneSizes).toEqual({ 'top-bottom': 66.7, 'left-right': 66.7 })
})
