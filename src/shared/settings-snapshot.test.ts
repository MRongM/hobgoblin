import { describe, expect, test } from 'vitest'
import {
  buildRuntimeRecentReposState,
  buildRuntimeSettingsSnapshot,
  buildSettingsSnapshot,
  restorableSessionStateFromSettingsSnapshot,
  runtimeRecentReposStateFromSettingsSnapshot,
  runtimeSettingsSnapshotFromSettingsSnapshot,
} from '#/shared/settings-snapshot.ts'

describe('settings snapshot partitions', () => {
  test('builds runtime settings without recent repo or restorable session fields', () => {
    expect(
      buildRuntimeSettingsSnapshot({
        prefs: {
          lang: 'ja',
          theme: 'dark',
          colorTheme: 'github',
          fetchIntervalSec: 300,
          gitNetworkProxyEnabled: true,
          gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
          gitNetworkTimeoutSec: 180,
          terminalNotificationsEnabled: true,
          shortcutsDisabled: true,
          globalShortcutDisabled: false,
          swapCloseShortcuts: true,
          toggleDetailOnActionBarBlankClick: true,
          terminalThemeSyncEnabled: false,
          temporaryFilesDirectory: '/Users/test/tmp',
          globalShortcut: 'CommandOrControl+Shift+K',
          terminalApp: 'ghostty',
          editorApp: 'cursor',
          fileTreeFontSize: 13,
          fileTreeTopbarFontSize: 12,
          fileTreeClipboardMaxBytesMb: 30,
          terminalFontSize: 15,
          terminalExternalInputEnabled: true,
          remoteTerminalTmuxEnabled: true,
          terminalCustomButtonsVisible: false,
          terminalCustomButtonSize: 'large',
          terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
          lanEnabled: true,
        },
        globalShortcutRegistered: true,
      }),
    ).toEqual({
      lang: 'ja',
      theme: 'dark',
      colorTheme: 'github',
      fetchIntervalSec: 300,
      gitNetworkProxyEnabled: true,
      gitNetworkProxyUrl: 'socks5://127.0.0.1:7890',
      gitNetworkTimeoutSec: 180,
      terminalNotificationsEnabled: true,
      shortcutsDisabled: true,
      globalShortcutDisabled: false,
      swapCloseShortcuts: true,
      toggleDetailOnActionBarBlankClick: true,
      terminalThemeSyncEnabled: false,
      temporaryFilesDirectory: '/Users/test/tmp',
      globalShortcut: 'CommandOrControl+Shift+K',
      globalShortcutRegistered: true,
      terminalApp: 'ghostty',
      editorApp: 'cursor',
      fileTreeFontSize: 13,
      fileTreeTopbarFontSize: 12,
      fileTreeClipboardMaxBytesMb: 30,
      terminalFontSize: 15,
      terminalExternalInputEnabled: true,
      remoteTerminalTmuxEnabled: true,
      terminalCustomButtonsVisible: false,
      terminalCustomButtonSize: 'large',
      terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'input' }],
      lanEnabled: true,
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
        fetchIntervalSec: 120,
        gitNetworkProxyEnabled: false,
        gitNetworkProxyUrl: '',
        gitNetworkTimeoutSec: 120,
        terminalNotificationsEnabled: false,
        shortcutsDisabled: false,
        globalShortcutDisabled: true,
        swapCloseShortcuts: false,
        toggleDetailOnActionBarBlankClick: false,
        terminalThemeSyncEnabled: true,
        temporaryFilesDirectory: '',
        globalShortcut: 'CommandOrControl+Shift+G',
        terminalApp: 'auto',
        editorApp: 'auto',
        fileTreeFontSize: 12,
        fileTreeTopbarFontSize: 13,
        fileTreeClipboardMaxBytesMb: 30,
        terminalFontSize: 14,
        terminalExternalInputEnabled: false,
        remoteTerminalTmuxEnabled: false,
        terminalCustomButtonsVisible: true,
        terminalCustomButtonSize: 'medium',
        terminalCustomButtons: [{ label: 'status', value: 'git status --short', action: 'execute' }],
        lanEnabled: false,
      },
      globalShortcutRegistered: false,
      recentRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
      session: {
        openRepos: [{ kind: 'local', id: '/tmp/repo-b' }],
        activeRepo: '/tmp/repo-b',
        detailCollapsed: false,
        detailFocusMode: true,
        workspaceLayout: 'top-bottom',
        detailPaneSizes: { 'top-bottom': 40, 'left-right': 50 },
        selectedTerminalByWorktree: { '/tmp/repo-b\0/tmp/repo-b': 'terminal-1' },
      },
    })

    expect(runtimeSettingsSnapshotFromSettingsSnapshot(snapshot)).toMatchObject({
      globalShortcutRegistered: false,
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      temporaryFilesDirectory: '',
      terminalThemeSyncEnabled: true,
      terminalExternalInputEnabled: false,
      remoteTerminalTmuxEnabled: false,
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
      detailCollapsed: false,
      detailFocusMode: true,
      workspaceLayout: 'top-bottom',
      detailPaneSizes: { 'top-bottom': 40, 'left-right': 50 },
      selectedTerminalByWorktree: { '/tmp/repo-b\0/tmp/repo-b': 'terminal-1' },
    })
  })
})
