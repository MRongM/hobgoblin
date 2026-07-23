import { describe, expect, test } from 'vitest'
import {
  buildRuntimeRecentReposState,
  buildRuntimeSettingsSnapshot,
  buildSettingsSnapshot,
  restorableSessionStateFromSettingsSnapshot,
  runtimeRecentReposStateFromSettingsSnapshot,
  runtimeSettingsSnapshotFromSettingsSnapshot,
} from '#/shared/settings-snapshot.ts'
import { defaultSessionState, defaultSettingsPrefs, defaultSettingsSnapshot } from '#/shared/settings-defaults.ts'

describe('settings snapshot partitions', () => {
  test('builds runtime settings without recent repo or restorable session fields', () => {
    const runtime = buildRuntimeSettingsSnapshot({
      prefs: {
        lang: 'ja',
        theme: 'dark',
        colorTheme: 'github',
        fontFamily: 'maple',
        fetchIntervalSec: 300,
        gitNetworkProxyEnabled: true,
        gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
        gitNetworkTimeoutSec: 180,
        terminalNotificationsEnabled: true,
        shortcutsDisabled: true,
        globalShortcutDisabled: false,
        swapCloseShortcuts: true,
        terminalThemeSyncEnabled: false,
        temporaryFilesDirectory: '/Users/test/tmp',
        globalShortcut: 'CommandOrControl+Shift+K',
        terminalApp: 'ghostty',
        editorApp: 'cursor',
        topbarHeightPx: 38,
        toolbarHeightPx: 40,
        fileTreeFontSize: 13,
        fileTreeTopbarFontSize: 12,
        fileTreeClipboardMaxBytesMb: 30,
        terminalFontSize: 15,
        internalTerminalTmuxEnabled: true,
        terminalCustomButtonsVisible: false,
        terminalCustomButtonSize: 'large',
        terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
        lanEnabled: true,
        serverPort: 33001,
      },
      globalShortcutRegistered: true,
    })

    expect(runtime).toEqual({
      lang: 'ja',
      theme: 'dark',
      colorTheme: 'github',
      fontFamily: 'maple',
      fetchIntervalSec: 300,
      gitNetworkProxyEnabled: true,
      gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
      gitNetworkTimeoutSec: 180,
      terminalNotificationsEnabled: true,
      shortcutsDisabled: true,
      globalShortcutDisabled: false,
      swapCloseShortcuts: true,
      terminalThemeSyncEnabled: false,
      temporaryFilesDirectory: '/Users/test/tmp',
      globalShortcut: 'CommandOrControl+Shift+K',
      globalShortcutRegistered: true,
      terminalApp: 'ghostty',
      editorApp: 'cursor',
      topbarHeightPx: 38,
      toolbarHeightPx: 40,
      fileTreeFontSize: 13,
      fileTreeTopbarFontSize: 12,
      fileTreeClipboardMaxBytesMb: 30,
      terminalFontSize: 15,
      internalTerminalTmuxEnabled: true,
      terminalCustomButtonsVisible: false,
      terminalCustomButtonSize: 'large',
      terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
      lanEnabled: true,
      serverPort: 33001,
    })
  })

  test('builds runtime recent repos separately from settings prefs', () => {
    expect(
      buildRuntimeRecentReposState({
        recentRepos: [{ kind: 'local', id: '/tmp/repo-a' }],
      }),
    ).toEqual({
      recentRepos: [{ kind: 'local', id: '/tmp/repo-a' }],
    })
  })

  test('splits a full settings snapshot into runtime settings and restorable session', () => {
    const snapshot = buildSettingsSnapshot({
      prefs: {
        lang: 'auto',
        theme: 'auto',
        colorTheme: 'macos',
        fontFamily: 'system',
        fetchIntervalSec: 120,
        gitNetworkProxyEnabled: false,
        gitNetworkProxyUrl: '',
        gitNetworkTimeoutSec: 120,
        terminalNotificationsEnabled: false,
        shortcutsDisabled: false,
        globalShortcutDisabled: true,
        swapCloseShortcuts: false,
        terminalThemeSyncEnabled: true,
        temporaryFilesDirectory: '',
        globalShortcut: 'CommandOrControl+Shift+G',
        terminalApp: 'auto',
        editorApp: 'auto',
        topbarHeightPx: 34,
        toolbarHeightPx: 36,
        fileTreeFontSize: 12,
        fileTreeTopbarFontSize: 13,
        fileTreeClipboardMaxBytesMb: 30,
        terminalFontSize: 14,
        internalTerminalTmuxEnabled: false,
        terminalCustomButtonsVisible: true,
        terminalCustomButtonSize: 'medium',
        terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
        lanEnabled: false,
        serverPort: 32200,
      },
      globalShortcutRegistered: false,
      recentRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
      repoSettings: [],
      webAccess: { enabled: false, username: '', passwordConfigured: false },
      telegramNotifications: {
        enabled: false,
        botTokenConfigured: false,
        chatId: '',
        bellEnabled: true,
        outputCompletionEnabled: false,
        includeTerminalOutput: false,
        outputTailLength: 200,
      },
      session: {
        openRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
        activeRepo: '/tmp/repo-b',
        projectListExpanded: true,
        detailCollapsed: false,
        detailFocusMode: false,
        workspaceLayout: 'left-right',
        detailPaneSizes: { 'left-right': 50 },
        selectedTerminalByWorktree: { '/tmp/repo-b\0/tmp/repo-b': 'terminal-1' },
      },
    })

    const runtime = runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)

    expect(runtime).toMatchObject({
      fontFamily: 'system',
      globalShortcutRegistered: false,
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      temporaryFilesDirectory: '',
      terminalThemeSyncEnabled: true,
      internalTerminalTmuxEnabled: false,
      topbarHeightPx: 34,
      toolbarHeightPx: 36,
      fileTreeTopbarFontSize: 13,
      fileTreeClipboardMaxBytesMb: 30,
      terminalCustomButtonsVisible: true,
      terminalCustomButtonSize: 'medium',
      terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
    })
    expect(runtimeRecentReposStateFromSettingsSnapshot(snapshot)).toEqual({
      recentRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
    })
    expect(restorableSessionStateFromSettingsSnapshot(snapshot)).toEqual({
      openRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
      activeRepo: '/tmp/repo-b',
      projectListExpanded: true,
      detailCollapsed: false,
      detailFocusMode: false,
      workspaceLayout: 'left-right',
      detailPaneSizes: { 'left-right': 50 },
      selectedTerminalByWorktree: { '/tmp/repo-b\0/tmp/repo-b': 'terminal-1' },
    })
  })

  test('settings snapshot builders preserve repo settings', () => {
    const repoSettings = [
      {
        repoId: '/repo',
        worktreeBootstrapTrust: {
          configHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          trustedAt: '2026-07-08T00:00:00.000Z',
        },
      },
    ]

    const snapshot = buildSettingsSnapshot({
      prefs: defaultSettingsPrefs(),
      globalShortcutRegistered: false,
      session: defaultSessionState(),
      recentRepos: [],
      repoSettings,
      webAccess: { enabled: false, username: '', passwordConfigured: false },
      telegramNotifications: {
        enabled: false,
        botTokenConfigured: false,
        chatId: '',
        bellEnabled: true,
        outputCompletionEnabled: false,
        includeTerminalOutput: false,
        outputTailLength: 200,
      },
    })

    expect(snapshot.repoSettings).toEqual(repoSettings)
    expect(defaultSettingsSnapshot().repoSettings).toEqual([])
  })

  test('settings snapshots expose only the public web access projection', () => {
    const snapshot = buildSettingsSnapshot({
      prefs: defaultSettingsPrefs(),
      globalShortcutRegistered: false,
      session: defaultSessionState(),
      recentRepos: [],
      repoSettings: [],
      webAccess: { enabled: true, username: 'operator', passwordConfigured: true },
      telegramNotifications: {
        enabled: true,
        botTokenConfigured: true,
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        includeTerminalOutput: true,
        outputTailLength: 1024,
      },
    })

    expect(snapshot.webAccess).toEqual({ enabled: true, username: 'operator', passwordConfigured: true })
    expect(snapshot.telegramNotifications).toEqual({
      enabled: true,
      botTokenConfigured: true,
      chatId: '-100123',
      bellEnabled: true,
      outputCompletionEnabled: true,
      includeTerminalOutput: true,
      outputTailLength: 1024,
    })
    expect(JSON.stringify(snapshot)).not.toContain('passwordHash')
  })
})
