import { describe, expect, test } from 'vitest'
import {
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  DEFAULT_FONT_FAMILY,
  DEFAULT_GIT_NETWORK_PROXY_ENABLED,
  DEFAULT_GIT_NETWORK_PROXY_URL,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  DEFAULT_STATUS_REFRESH_INTERVAL_SEC,
  DEFAULT_TOPBAR_HEIGHT_PX,
  DEFAULT_TOOLBAR_HEIGHT_PX,
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED,
  MAX_CHROME_HEIGHT_PX,
  MIN_CHROME_HEIGHT_PX,
  defaultInitialSettingsSnapshot,
  defaultSessionState,
  defaultSettingsPrefs,
  defaultSettingsSnapshot,
} from '#/shared/settings-defaults.ts'

describe('settings defaults', () => {
  test('defaults workspace navigation to empty tagged contexts and expanded-by-default repository lists', () => {
    expect(defaultSessionState()).toMatchObject({
      workspaceActiveContextByRoot: {},
      workspaceRepositoryListExpandedByRoot: {},
      workspaceRepositoryListHeightByRoot: {},
    })
    expect(defaultSessionState()).not.toHaveProperty('workspaceActiveRepoByRoot')
  })

  test('defaults file tree font size to 14', () => {
    expect(DEFAULT_FILE_TREE_FONT_SIZE).toBe(14)
    expect(defaultSettingsPrefs().fileTreeFontSize).toBe(14)
  })

  test('defaults file tree clipboard max bytes to 30 MB', () => {
    expect(DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB).toBe(30)
    expect(defaultSettingsPrefs().fileTreeClipboardMaxBytesMb).toBe(30)
    expect(defaultInitialSettingsSnapshot().fileTreeClipboardMaxBytesMb).toBe(30)
  })

  test('defaults configurable chrome heights to 34px', () => {
    expect(DEFAULT_TOPBAR_HEIGHT_PX).toBe(34)
    expect(DEFAULT_TOOLBAR_HEIGHT_PX).toBe(34)
    expect(MIN_CHROME_HEIGHT_PX).toBe(30)
    expect(MAX_CHROME_HEIGHT_PX).toBe(48)
    expect(defaultSettingsPrefs()).toMatchObject({
      topbarHeightPx: 34,
      toolbarHeightPx: 34,
    })
    expect(defaultInitialSettingsSnapshot()).toMatchObject({
      topbarHeightPx: 34,
      toolbarHeightPx: 34,
    })
  })

  test('defaults terminal custom button size to medium', () => {
    expect(DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE).toBe('medium')
    expect((defaultSettingsPrefs() as { terminalCustomButtonSize?: string }).terminalCustomButtonSize).toBe('medium')
  })

  test('enables terminal bell notifications by default without overriding opt-out', () => {
    expect(DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED).toBe(true)
    expect(defaultSettingsPrefs().terminalNotificationsEnabled).toBe(true)
    expect(defaultInitialSettingsSnapshot().terminalNotificationsEnabled).toBe(true)
    expect(defaultSettingsPrefs({ terminalNotificationsEnabled: false }).terminalNotificationsEnabled).toBe(false)
  })

  test('defaults Telegram notifications to disabled and unconfigured', () => {
    expect(defaultSettingsSnapshot().telegramNotifications).toEqual({
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

  test('defaults global font family to mono', () => {
    expect(DEFAULT_FONT_FAMILY).toBe('mono')
    expect(defaultSettingsPrefs().fontFamily).toBe('mono')
    expect(defaultInitialSettingsSnapshot().fontFamily).toBe('mono')
  })

  test('defaults git network proxy off with a 120 second timeout', () => {
    expect(DEFAULT_GIT_NETWORK_PROXY_ENABLED).toBe(false)
    expect(DEFAULT_GIT_NETWORK_PROXY_URL).toBe('')
    expect(DEFAULT_GIT_NETWORK_TIMEOUT_SEC).toBe(120)
    expect(defaultSettingsPrefs()).toMatchObject({
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
    })
  })

  test('defaults scheduled status refresh to 120 seconds without overriding explicit values', () => {
    expect(DEFAULT_STATUS_REFRESH_INTERVAL_SEC).toBe(120)
    expect(defaultSettingsPrefs().statusRefreshIntervalSec).toBe(120)
    expect(defaultInitialSettingsSnapshot().statusRefreshIntervalSec).toBe(120)
    expect(defaultSettingsPrefs({ statusRefreshIntervalSec: 300 }).statusRefreshIntervalSec).toBe(300)
  })
})
