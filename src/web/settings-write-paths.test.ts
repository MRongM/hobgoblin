// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsSnapshot, defaultSessionState } from '#/shared/settings-defaults.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { externalAppsQueryKey, lanInfoQueryKey, settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { RepoSettingsEntry } from '#/shared/repo-settings.ts'
import type { TerminalCustomButton } from '#/shared/rpc.ts'

type AddRecentRepoResult = {
  recentRepos: RepoSessionEntry[]
  addedRepo: RepoSessionEntry | null
}

const appDataClientMocks = vi.hoisted(() => ({
  addRecentRepo: vi.fn<() => Promise<AddRecentRepoResult>>(async () => ({ recentRepos: [], addedRepo: null })),
  clearRecentRepos: vi.fn(async () => {}),
  refreshExternalAppsSnapshot: vi.fn(async () => ({
    terminal: {
      pref: 'auto',
      resolved: null,
      available: false,
      appAvailability: { ghostty: false, terminal: false },
      detectedAt: 0,
    },
    editor: {
      pref: 'auto',
      resolved: null,
      available: false,
      appAvailability: { vscode: false, cursor: false, windsurf: false },
      detectedAt: 0,
    },
  })),
  saveSession: vi.fn(async (session) => session),
  setFontFamily: vi.fn(async (fontFamily: 'mono' | 'maple' | 'system') => fontFamily),
  setFileTreeFontSize: vi.fn(async (fontSize: number) => fontSize),
  setFileTreeTopbarFontSize: vi.fn(async (fontSize: number) => fontSize),
  setGlobalShortcut: vi.fn(async (accelerator) => ({ accelerator, registered: true })),
  setGlobalShortcutDisabled: vi.fn(async () => {}),
  setGitNetworkProxyEnabled: vi.fn(async () => {}),
  setGitNetworkProxyUrl: vi.fn(async () => {}),
  setGitNetworkTimeoutSec: vi.fn(async () => {}),
  setLanEnabled: vi.fn(async () => {}),
  setPreferredEditorApp: vi.fn(async (pref) => ({
    pref,
    resolved: null,
    available: false,
    appAvailability: { vscode: false, cursor: false, windsurf: false },
    detectedAt: 0,
  })),
  setPreferredTerminalApp: vi.fn(async (pref) => ({
    pref,
    resolved: null,
    available: false,
    appAvailability: { ghostty: false, terminal: false },
    detectedAt: 0,
  })),
  setProjectColorTheme: vi.fn<() => Promise<RepoSettingsEntry[]>>(async () => []),
  setSettingsFetchInterval: vi.fn(async (sec) => sec),
  setShortcutsDisabled: vi.fn(async () => {}),
  setSwapCloseShortcuts: vi.fn(async () => {}),
  setTemporaryFilesDirectory: vi.fn(async () => {}),
  setTerminalCustomButtonSize: vi.fn(async () => {}),
  setTerminalCustomButtons: vi.fn(async (buttons: TerminalCustomButton[]) => buttons),
  setTerminalCustomButtonsVisible: vi.fn(async () => {}),
  setTerminalFontSize: vi.fn(async (fontSize: number) => fontSize),
  setTerminalNotificationsEnabled: vi.fn(async () => {}),
  setWebAccessSettings: vi.fn(async (input) => ({
    enabled: input.enabled === true,
    username: input.username,
    passwordConfigured: true,
  })),
  saveTelegramNotificationSettings: vi.fn(async (input) => ({
    enabled: input.enabled === true,
    botTokenConfigured: Boolean(input.botToken),
    chatId: input.chatId,
    proxyEnabled: input.proxyEnabled !== false,
    bellEnabled: input.bellEnabled,
    outputCompletionEnabled: input.outputCompletionEnabled,
    outputCompletionMinimumActivitySeconds: input.outputCompletionMinimumActivitySeconds,
    includeTerminalOutput: input.includeTerminalOutput,
    outputTailLength: input.outputTailLength,
  })),
}))

vi.mock('#/web/settings-client.ts', () => ({
  addRecentRepo: appDataClientMocks.addRecentRepo,
  clearRecentRepos: appDataClientMocks.clearRecentRepos,
  refreshExternalAppsSnapshot: appDataClientMocks.refreshExternalAppsSnapshot,
  saveSession: appDataClientMocks.saveSession,
  setFontFamily: appDataClientMocks.setFontFamily,
  setFileTreeFontSize: appDataClientMocks.setFileTreeFontSize,
  setFileTreeTopbarFontSize: appDataClientMocks.setFileTreeTopbarFontSize,
  setGlobalShortcut: appDataClientMocks.setGlobalShortcut,
  setGlobalShortcutDisabled: appDataClientMocks.setGlobalShortcutDisabled,
  setGitNetworkProxyEnabled: appDataClientMocks.setGitNetworkProxyEnabled,
  setGitNetworkProxyUrl: appDataClientMocks.setGitNetworkProxyUrl,
  setGitNetworkTimeoutSec: appDataClientMocks.setGitNetworkTimeoutSec,
  setLanEnabled: appDataClientMocks.setLanEnabled,
  setPreferredEditorApp: appDataClientMocks.setPreferredEditorApp,
  setPreferredTerminalApp: appDataClientMocks.setPreferredTerminalApp,
  setProjectColorTheme: appDataClientMocks.setProjectColorTheme,
  setSettingsFetchInterval: appDataClientMocks.setSettingsFetchInterval,
  setShortcutsDisabled: appDataClientMocks.setShortcutsDisabled,
  setSwapCloseShortcuts: appDataClientMocks.setSwapCloseShortcuts,
  setTemporaryFilesDirectory: appDataClientMocks.setTemporaryFilesDirectory,
  setTerminalCustomButtonSize: appDataClientMocks.setTerminalCustomButtonSize,
  setTerminalCustomButtons: appDataClientMocks.setTerminalCustomButtons,
  setTerminalCustomButtonsVisible: appDataClientMocks.setTerminalCustomButtonsVisible,
  setTerminalFontSize: appDataClientMocks.setTerminalFontSize,
  setTerminalNotificationsEnabled: appDataClientMocks.setTerminalNotificationsEnabled,
  setWebAccessSettings: appDataClientMocks.setWebAccessSettings,
  saveTelegramNotificationSettings: appDataClientMocks.saveTelegramNotificationSettings,
}))

describe('settings write paths', () => {
  beforeEach(() => {
    mainWindowQueryClient.clear()
    appDataClientMocks.addRecentRepo.mockReset()
    appDataClientMocks.addRecentRepo.mockResolvedValue({ recentRepos: [], addedRepo: null })
    appDataClientMocks.clearRecentRepos.mockReset()
    appDataClientMocks.clearRecentRepos.mockResolvedValue(undefined)
    appDataClientMocks.refreshExternalAppsSnapshot.mockReset()
    appDataClientMocks.refreshExternalAppsSnapshot.mockResolvedValue({
      terminal: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { ghostty: false, terminal: false },
        detectedAt: 0,
      },
      editor: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { vscode: false, cursor: false, windsurf: false },
        detectedAt: 0,
      },
    })
    appDataClientMocks.saveSession.mockReset()
    appDataClientMocks.saveSession.mockImplementation(async (session) => session)
    appDataClientMocks.setFontFamily.mockReset()
    appDataClientMocks.setFontFamily.mockImplementation(async (fontFamily: 'mono' | 'maple' | 'system') => fontFamily)
    appDataClientMocks.setFileTreeFontSize.mockReset()
    appDataClientMocks.setFileTreeFontSize.mockImplementation(async (fontSize: number) => fontSize)
    appDataClientMocks.setFileTreeTopbarFontSize.mockReset()
    appDataClientMocks.setFileTreeTopbarFontSize.mockImplementation(async (fontSize: number) => fontSize)
    appDataClientMocks.setGlobalShortcut.mockReset()
    appDataClientMocks.setGlobalShortcut.mockImplementation(async (accelerator) => ({ accelerator, registered: true }))
    appDataClientMocks.setGlobalShortcutDisabled.mockReset()
    appDataClientMocks.setGlobalShortcutDisabled.mockResolvedValue(undefined)
    appDataClientMocks.setGitNetworkProxyEnabled.mockReset()
    appDataClientMocks.setGitNetworkProxyEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setGitNetworkProxyUrl.mockReset()
    appDataClientMocks.setGitNetworkProxyUrl.mockResolvedValue(undefined)
    appDataClientMocks.setGitNetworkTimeoutSec.mockReset()
    appDataClientMocks.setGitNetworkTimeoutSec.mockResolvedValue(undefined)
    appDataClientMocks.setLanEnabled.mockReset()
    appDataClientMocks.setLanEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setPreferredEditorApp.mockReset()
    appDataClientMocks.setPreferredEditorApp.mockImplementation(async (pref) => ({
      pref,
      resolved: null,
      available: false,
      appAvailability: { vscode: false, cursor: false, windsurf: false },
      detectedAt: 0,
    }))
    appDataClientMocks.setPreferredTerminalApp.mockReset()
    appDataClientMocks.setPreferredTerminalApp.mockImplementation(async (pref) => ({
      pref,
      resolved: null,
      available: false,
      appAvailability: { ghostty: false, terminal: false },
      detectedAt: 0,
    }))
    appDataClientMocks.setProjectColorTheme.mockReset()
    appDataClientMocks.setProjectColorTheme.mockResolvedValue([])
    appDataClientMocks.setSettingsFetchInterval.mockReset()
    appDataClientMocks.setSettingsFetchInterval.mockImplementation(async (sec) => sec)
    appDataClientMocks.setShortcutsDisabled.mockReset()
    appDataClientMocks.setShortcutsDisabled.mockResolvedValue(undefined)
    appDataClientMocks.setSwapCloseShortcuts.mockReset()
    appDataClientMocks.setSwapCloseShortcuts.mockResolvedValue(undefined)
    appDataClientMocks.setTemporaryFilesDirectory.mockReset()
    appDataClientMocks.setTemporaryFilesDirectory.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalCustomButtonSize.mockReset()
    appDataClientMocks.setTerminalCustomButtonSize.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalCustomButtons.mockReset()
    appDataClientMocks.setTerminalCustomButtons.mockImplementation(async (buttons: TerminalCustomButton[]) => buttons)
    appDataClientMocks.setTerminalCustomButtonsVisible.mockReset()
    appDataClientMocks.setTerminalCustomButtonsVisible.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalFontSize.mockReset()
    appDataClientMocks.setTerminalFontSize.mockImplementation(async (fontSize: number) => fontSize)
    appDataClientMocks.setTerminalNotificationsEnabled.mockReset()
    appDataClientMocks.setTerminalNotificationsEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setWebAccessSettings.mockReset()
    appDataClientMocks.setWebAccessSettings.mockImplementation(async (input) => ({
      enabled: input.enabled === true,
      username: input.username,
      passwordConfigured: true,
    }))
    appDataClientMocks.saveTelegramNotificationSettings.mockReset()
    appDataClientMocks.saveTelegramNotificationSettings.mockImplementation(async (input) => ({
      enabled: input.enabled === true,
      botTokenConfigured: Boolean(input.botToken),
      chatId: input.chatId,
      proxyEnabled: input.proxyEnabled !== false,
      bellEnabled: input.bellEnabled,
      outputCompletionEnabled: input.outputCompletionEnabled,
      outputCompletionMinimumActivitySeconds: input.outputCompletionMinimumActivitySeconds,
      includeTerminalOutput: input.includeTerminalOutput,
      outputTailLength: input.outputTailLength,
    }))
  })

  test('recordRecentRepo syncs recent repos into the settings snapshot cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    appDataClientMocks.addRecentRepo.mockResolvedValue({
      recentRepos: [{ kind: 'local', id: '/tmp/repo-a' }],
      addedRepo: { kind: 'local', id: '/tmp/repo-a' },
    })
    const { recordRecentRepo } = await import('#/web/settings-write-paths.ts')

    await recordRecentRepo({ kind: 'local', id: '/tmp/repo-a' })

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      recentRepos: [{ kind: 'local', id: '/tmp/repo-a' }],
    })
  })

  test('clearRecentRepoHistory clears recent repos from the settings snapshot cache', async () => {
    mainWindowQueryClient.setQueryData(
      settingsSnapshotQueryKey(),
      defaultSettingsSnapshot({ recentRepos: [{ kind: 'local', id: '/tmp/repo-a' }] }),
    )
    const { clearRecentRepoHistory } = await import('#/web/settings-write-paths.ts')

    await clearRecentRepoHistory()

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      recentRepos: [],
    })
  })

  test('persistSessionState syncs the saved session into the settings snapshot cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const session = {
      ...defaultSessionState(),
      openRepos: [{ kind: 'local' as const, id: '/tmp/repo-a' }],
      activeRepo: '/tmp/repo-a',
    }
    appDataClientMocks.saveSession.mockResolvedValue(session)
    const { persistSessionState } = await import('#/web/settings-write-paths.ts')

    await persistSessionState(session)

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      session,
    })
  })

  test('setTerminalAppPreference updates both external apps and runtime settings caches', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    mainWindowQueryClient.setQueryData(externalAppsQueryKey(), {
      terminal: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { ghostty: false, terminal: false },
        detectedAt: 0,
      },
      editor: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { vscode: false, cursor: false, windsurf: false },
        detectedAt: 0,
      },
    })
    const { setTerminalAppPreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalAppPreference('ghostty')

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ terminalApp: 'ghostty' })
    expect(mainWindowQueryClient.getQueryData(externalAppsQueryKey())).toMatchObject({
      terminal: expect.objectContaining({ pref: 'ghostty' }),
    })
  })

  test('setLanEnabledPreference updates runtime settings cache and invalidates LAN info', async () => {
    const invalidateSpy = vi.spyOn(mainWindowQueryClient, 'invalidateQueries')
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setLanEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setLanEnabledPreference(true)

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ lanEnabled: true })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: lanInfoQueryKey() })
    invalidateSpy.mockRestore()
  })

  test('setFontFamilyPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setFontFamilyPreference } = await import('#/web/settings-write-paths.ts')

    await setFontFamilyPreference('system')

    expect(appDataClientMocks.setFontFamily).toHaveBeenCalledWith('system')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ fontFamily: 'system' })
  })

  test('setProjectColorThemePreference updates repo settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const repoSettings = [{ repoId: '/tmp/repo-a', colorTheme: 'cursor' as const }]
    appDataClientMocks.setProjectColorTheme.mockResolvedValue(repoSettings)
    const { setProjectColorThemePreference } = await import('#/web/settings-write-paths.ts')

    await setProjectColorThemePreference('/tmp/repo-a', 'cursor')

    expect(appDataClientMocks.setProjectColorTheme).toHaveBeenCalledWith('/tmp/repo-a', 'cursor')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ repoSettings })
  })

  test('setGitNetworkProxyEnabledPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkProxyEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkProxyEnabledPreference(true)

    expect(appDataClientMocks.setGitNetworkProxyEnabled).toHaveBeenCalledWith(true)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkProxyEnabled: true,
    })
  })

  test('setWebAccessSettingsPreference updates the public security snapshot cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const input = { enabled: true, username: 'operator', password: 'test-password' }
    const { setWebAccessSettingsPreference } = await import('#/web/settings-write-paths.ts')

    await expect(setWebAccessSettingsPreference(input)).resolves.toEqual({
      enabled: true,
      username: 'operator',
      passwordConfigured: true,
    })

    expect(appDataClientMocks.setWebAccessSettings).toHaveBeenCalledWith(input)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      webAccess: { enabled: true, username: 'operator', passwordConfigured: true },
    })
  })

  test('saveTelegramNotificationSettingsPreference updates only the masked Telegram cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const input = {
      enabled: true,
      botToken: '123456:test-token',
      chatId: '-100123',
      proxyEnabled: false,
      bellEnabled: true,
      outputCompletionEnabled: true,
      outputCompletionMinimumActivitySeconds: 30,
      includeTerminalOutput: true,
      outputTailLength: 400,
    }
    const { saveTelegramNotificationSettingsPreference } = await import('#/web/settings-write-paths.ts')

    await expect(saveTelegramNotificationSettingsPreference(input)).resolves.toEqual({
      enabled: true,
      botTokenConfigured: true,
      chatId: '-100123',
      proxyEnabled: false,
      bellEnabled: true,
      outputCompletionEnabled: true,
      outputCompletionMinimumActivitySeconds: 30,
      includeTerminalOutput: true,
      outputTailLength: 400,
    })
    const snapshot = mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())
    expect(snapshot).toMatchObject({
      telegramNotifications: {
        enabled: true,
        botTokenConfigured: true,
        chatId: '-100123',
        proxyEnabled: false,
        bellEnabled: true,
        outputCompletionEnabled: true,
        outputCompletionMinimumActivitySeconds: 30,
        includeTerminalOutput: true,
        outputTailLength: 400,
      },
    })
    expect(JSON.stringify(snapshot)).not.toContain('test-token')
  })

  test('setGitNetworkProxyUrlPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkProxyUrlPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkProxyUrlPreference('socks5://127.0.0.1:7890')

    expect(appDataClientMocks.setGitNetworkProxyUrl).toHaveBeenCalledWith('socks5://127.0.0.1:7890')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
    })
  })

  test('setGitNetworkTimeoutSecPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setGitNetworkTimeoutSecPreference } = await import('#/web/settings-write-paths.ts')

    await setGitNetworkTimeoutSecPreference(180)

    expect(appDataClientMocks.setGitNetworkTimeoutSec).toHaveBeenCalledWith(180)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      gitNetworkTimeoutSec: 180,
    })
  })

  test('setTemporaryFilesDirectoryPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTemporaryFilesDirectoryPreference } = await import('#/web/settings-write-paths.ts')

    await setTemporaryFilesDirectoryPreference('tmp/cache')

    expect(appDataClientMocks.setTemporaryFilesDirectory).toHaveBeenCalledWith('tmp/cache')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      temporaryFilesDirectory: 'tmp/cache',
    })
  })

  test('setTerminalCustomButtonsPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const buttons = [{ label: 'status', value: 'git status --short' }]
    const { setTerminalCustomButtonsPreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalCustomButtonsPreference(buttons)

    expect(appDataClientMocks.setTerminalCustomButtons).toHaveBeenCalledWith(buttons)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalCustomButtons: buttons,
    })
  })

  test('setTerminalCustomButtonSizePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalCustomButtonSizePreference } =
      (await import('#/web/settings-write-paths.ts')) as typeof import('#/web/settings-write-paths.ts') & {
        setTerminalCustomButtonSizePreference: (size: 'small' | 'medium' | 'large') => Promise<void>
      }

    await setTerminalCustomButtonSizePreference('large')

    expect(appDataClientMocks.setTerminalCustomButtonSize).toHaveBeenCalledWith('large')
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalCustomButtonSize: 'large',
    })
  })

  test('setFileTreeFontSizePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setFileTreeFontSizePreference } = await import('#/web/settings-write-paths.ts')

    await setFileTreeFontSizePreference(13)

    expect(appDataClientMocks.setFileTreeFontSize).toHaveBeenCalledWith(13)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      fileTreeFontSize: 13,
    })
  })

  test('setFileTreeTopbarFontSizePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setFileTreeTopbarFontSizePreference } = await import('#/web/settings-write-paths.ts')

    await setFileTreeTopbarFontSizePreference(12)

    expect(appDataClientMocks.setFileTreeTopbarFontSize).toHaveBeenCalledWith(12)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      fileTreeTopbarFontSize: 12,
    })
  })

  test('setTerminalFontSizePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalFontSizePreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalFontSizePreference(16)

    expect(appDataClientMocks.setTerminalFontSize).toHaveBeenCalledWith(16)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalFontSize: 16,
    })
  })

  test('setTerminalCustomButtonsVisiblePreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalCustomButtonsVisiblePreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalCustomButtonsVisiblePreference(false)

    expect(appDataClientMocks.setTerminalCustomButtonsVisible).toHaveBeenCalledWith(false)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalCustomButtonsVisible: false,
    })
  })

})
