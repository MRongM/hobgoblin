// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsSnapshot, defaultSessionState } from '#/shared/settings-defaults.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { externalAppsQueryKey, githubCliQueryKey, lanInfoQueryKey, settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { GitHubCliState, TerminalCustomButton } from '#/shared/rpc.ts'

type AddRecentRepoResult = {
  recentRepos: RepoSessionEntry[]
  addedRepo: RepoSessionEntry | null
}

const appDataClientMocks = vi.hoisted(() => ({
  addRecentRepo: vi.fn<() => Promise<AddRecentRepoResult>>(async () => ({ recentRepos: [], addedRepo: null })),
  clearRecentRepos: vi.fn(async () => {}),
  refreshExternalAppsSnapshot: vi.fn(async () => ({
    terminal: { pref: 'auto', resolved: null, available: false, appAvailability: { ghostty: false, terminal: false }, detectedAt: 0 },
    editor: { pref: 'auto', resolved: null, available: false, appAvailability: { vscode: false, cursor: false, windsurf: false }, detectedAt: 0 },
  })),
  refreshGitHubCliState: vi.fn<() => Promise<GitHubCliState>>(async () => ({
    available: false,
    version: null,
    detectedAt: 0,
    hosts: {},
  })),
  saveSession: vi.fn(async (session) => session),
  setFileTreeFontSize: vi.fn(async (fontSize: number) => fontSize),
  setGlobalShortcut: vi.fn(async (accelerator) => ({ accelerator, registered: true })),
  setGlobalShortcutDisabled: vi.fn(async () => {}),
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
  setSettingsFetchInterval: vi.fn(async (sec) => sec),
  setShortcutsDisabled: vi.fn(async () => {}),
  setSwapCloseShortcuts: vi.fn(async () => {}),
  setRemoteTerminalTmuxEnabled: vi.fn(async () => {}),
  setTerminalCustomButtons: vi.fn(async (buttons: TerminalCustomButton[]) => buttons),
  setTerminalCustomButtonsVisible: vi.fn(async () => {}),
  setTerminalExternalInputEnabled: vi.fn(async () => {}),
  setTerminalFontSize: vi.fn(async (fontSize: number) => fontSize),
  setTerminalNotificationsEnabled: vi.fn(async () => {}),
  setToggleDetailOnActionBarBlankClick: vi.fn(async () => {}),
}))

vi.mock('#/web/settings-client.ts', () => ({
  addRecentRepo: appDataClientMocks.addRecentRepo,
  clearRecentRepos: appDataClientMocks.clearRecentRepos,
  refreshExternalAppsSnapshot: appDataClientMocks.refreshExternalAppsSnapshot,
  refreshGitHubCliState: appDataClientMocks.refreshGitHubCliState,
  saveSession: appDataClientMocks.saveSession,
  setFileTreeFontSize: appDataClientMocks.setFileTreeFontSize,
  setGlobalShortcut: appDataClientMocks.setGlobalShortcut,
  setGlobalShortcutDisabled: appDataClientMocks.setGlobalShortcutDisabled,
  setLanEnabled: appDataClientMocks.setLanEnabled,
  setPreferredEditorApp: appDataClientMocks.setPreferredEditorApp,
  setPreferredTerminalApp: appDataClientMocks.setPreferredTerminalApp,
  setSettingsFetchInterval: appDataClientMocks.setSettingsFetchInterval,
  setShortcutsDisabled: appDataClientMocks.setShortcutsDisabled,
  setSwapCloseShortcuts: appDataClientMocks.setSwapCloseShortcuts,
  setRemoteTerminalTmuxEnabled: appDataClientMocks.setRemoteTerminalTmuxEnabled,
  setTerminalCustomButtons: appDataClientMocks.setTerminalCustomButtons,
  setTerminalCustomButtonsVisible: appDataClientMocks.setTerminalCustomButtonsVisible,
  setTerminalExternalInputEnabled: appDataClientMocks.setTerminalExternalInputEnabled,
  setTerminalFontSize: appDataClientMocks.setTerminalFontSize,
  setTerminalNotificationsEnabled: appDataClientMocks.setTerminalNotificationsEnabled,
  setToggleDetailOnActionBarBlankClick: appDataClientMocks.setToggleDetailOnActionBarBlankClick,
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
      terminal: { pref: 'auto', resolved: null, available: false, appAvailability: { ghostty: false, terminal: false }, detectedAt: 0 },
      editor: { pref: 'auto', resolved: null, available: false, appAvailability: { vscode: false, cursor: false, windsurf: false }, detectedAt: 0 },
    })
    appDataClientMocks.refreshGitHubCliState.mockReset()
    appDataClientMocks.refreshGitHubCliState.mockResolvedValue({ available: false, version: null, detectedAt: 0, hosts: {} })
    appDataClientMocks.saveSession.mockReset()
    appDataClientMocks.saveSession.mockImplementation(async (session) => session)
    appDataClientMocks.setFileTreeFontSize.mockReset()
    appDataClientMocks.setFileTreeFontSize.mockImplementation(async (fontSize: number) => fontSize)
    appDataClientMocks.setGlobalShortcut.mockReset()
    appDataClientMocks.setGlobalShortcut.mockImplementation(async (accelerator) => ({ accelerator, registered: true }))
    appDataClientMocks.setGlobalShortcutDisabled.mockReset()
    appDataClientMocks.setGlobalShortcutDisabled.mockResolvedValue(undefined)
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
    appDataClientMocks.setSettingsFetchInterval.mockReset()
    appDataClientMocks.setSettingsFetchInterval.mockImplementation(async (sec) => sec)
    appDataClientMocks.setShortcutsDisabled.mockReset()
    appDataClientMocks.setShortcutsDisabled.mockResolvedValue(undefined)
    appDataClientMocks.setSwapCloseShortcuts.mockReset()
    appDataClientMocks.setSwapCloseShortcuts.mockResolvedValue(undefined)
    appDataClientMocks.setRemoteTerminalTmuxEnabled.mockReset()
    appDataClientMocks.setRemoteTerminalTmuxEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalCustomButtons.mockReset()
    appDataClientMocks.setTerminalCustomButtons.mockImplementation(async (buttons: TerminalCustomButton[]) => buttons)
    appDataClientMocks.setTerminalCustomButtonsVisible.mockReset()
    appDataClientMocks.setTerminalCustomButtonsVisible.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalExternalInputEnabled.mockReset()
    appDataClientMocks.setTerminalExternalInputEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setTerminalFontSize.mockReset()
    appDataClientMocks.setTerminalFontSize.mockImplementation(async (fontSize: number) => fontSize)
    appDataClientMocks.setTerminalNotificationsEnabled.mockReset()
    appDataClientMocks.setTerminalNotificationsEnabled.mockResolvedValue(undefined)
    appDataClientMocks.setToggleDetailOnActionBarBlankClick.mockReset()
    appDataClientMocks.setToggleDetailOnActionBarBlankClick.mockResolvedValue(undefined)
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
      terminal: { pref: 'auto', resolved: null, available: false, appAvailability: { ghostty: false, terminal: false }, detectedAt: 0 },
      editor: { pref: 'auto', resolved: null, available: false, appAvailability: { vscode: false, cursor: false, windsurf: false }, detectedAt: 0 },
    })
    const { setTerminalAppPreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalAppPreference('ghostty')

    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({ terminalApp: 'ghostty' })
    expect(mainWindowQueryClient.getQueryData(externalAppsQueryKey())).toMatchObject({
      terminal: expect.objectContaining({ pref: 'ghostty' }),
    })
  })

  test('refreshGitHubCliDetection writes refreshed state into the GitHub CLI cache', async () => {
    appDataClientMocks.refreshGitHubCliState.mockResolvedValue({
      available: true,
      version: '2.70.0',
      detectedAt: 1,
      hosts: {
        'github.com': {
          host: 'github.com',
          authenticated: true,
          activeLogin: 'octocat',
          logins: ['octocat'],
          tokenSource: 'keychain',
        },
      },
    })
    const { refreshGitHubCliDetection } = await import('#/web/settings-write-paths.ts')

    await refreshGitHubCliDetection()

    expect(mainWindowQueryClient.getQueryData(githubCliQueryKey())).toMatchObject({
      available: true,
      version: '2.70.0',
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

  test('setTerminalExternalInputEnabledPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setTerminalExternalInputEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setTerminalExternalInputEnabledPreference(true)

    expect(appDataClientMocks.setTerminalExternalInputEnabled).toHaveBeenCalledWith(true)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      terminalExternalInputEnabled: true,
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

  test('setRemoteTerminalTmuxEnabledPreference updates runtime settings cache', async () => {
    mainWindowQueryClient.setQueryData(settingsSnapshotQueryKey(), defaultSettingsSnapshot())
    const { setRemoteTerminalTmuxEnabledPreference } = await import('#/web/settings-write-paths.ts')

    await setRemoteTerminalTmuxEnabledPreference(true)

    expect(appDataClientMocks.setRemoteTerminalTmuxEnabled).toHaveBeenCalledWith(true)
    expect(mainWindowQueryClient.getQueryData(settingsSnapshotQueryKey())).toMatchObject({
      remoteTerminalTmuxEnabled: true,
    })
  })
})
