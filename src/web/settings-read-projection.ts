import { getInitialBootstrap } from '#/web/bootstrap.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { externalAppsQueryKey, settingsSnapshotQueryKey, useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import type { ExternalAppsSnapshot, RuntimeRecentReposState, RuntimeSettingsSnapshot, SettingsSnapshot } from '#/shared/rpc.ts'
import type { EditorPref, TerminalPref } from '#/shared/rpc.ts'
import { runtimeRecentReposStateFromSettingsSnapshot, runtimeSettingsSnapshotFromSettingsSnapshot } from '#/shared/settings-snapshot.ts'
import {
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  DEFAULT_TERMINAL_FONT_SIZE,
} from '#/shared/settings-defaults.ts'

export function fallbackInitialSettings() {
  return getInitialBootstrap().initialSettings
}

export function currentSettingsSnapshot(): SettingsSnapshot | undefined {
  return mainWindowQueryClient.getQueryData<SettingsSnapshot>(settingsSnapshotQueryKey())
}

export function runtimeSettingsSnapshotOrUndefined(
  snapshot: SettingsSnapshot | undefined,
): RuntimeSettingsSnapshot | undefined {
  return snapshot ? runtimeSettingsSnapshotFromSettingsSnapshot(snapshot) : undefined
}

export function currentRuntimeSettingsSnapshot(): RuntimeSettingsSnapshot | undefined {
  return runtimeSettingsSnapshotOrUndefined(currentSettingsSnapshot())
}

export function runtimeRecentReposStateOrUndefined(
  snapshot: SettingsSnapshot | undefined,
): RuntimeRecentReposState | undefined {
  return snapshot ? runtimeRecentReposStateFromSettingsSnapshot(snapshot) : undefined
}

export function currentRuntimeRecentReposState(): RuntimeRecentReposState | undefined {
  return runtimeRecentReposStateOrUndefined(currentSettingsSnapshot())
}

export function useRuntimeSettingsSnapshot(): RuntimeSettingsSnapshot | undefined {
  const { data } = useSettingsSnapshotQuery()
  return runtimeSettingsSnapshotOrUndefined(data)
}

export function useRuntimeRecentReposState(): RuntimeRecentReposState | undefined {
  const { data } = useSettingsSnapshotQuery()
  return runtimeRecentReposStateOrUndefined(data)
}

export function currentExternalAppsSnapshot(): ExternalAppsSnapshot | undefined {
  return mainWindowQueryClient.getQueryData<ExternalAppsSnapshot>(externalAppsQueryKey())
}

export function readRuntimeShortcutSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    shortcutsDisabled: data?.shortcutsDisabled ?? fallback?.shortcutsDisabled ?? false,
    swapCloseShortcuts: data?.swapCloseShortcuts ?? fallback?.swapCloseShortcuts ?? false,
    globalShortcutDisabled: data?.globalShortcutDisabled ?? fallback?.globalShortcutDisabled ?? false,
    globalShortcut: data?.globalShortcut ?? fallback?.globalShortcut ?? 'CommandOrControl+Shift+G',
    globalShortcutRegistered: data?.globalShortcutRegistered ?? fallback?.globalShortcutRegistered ?? false,
    toggleDetailOnActionBarBlankClick:
      data?.toggleDetailOnActionBarBlankClick ?? fallback?.toggleDetailOnActionBarBlankClick ?? false,
  }
}

export function readRuntimeFetchSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fetchIntervalSec: data?.fetchIntervalSec ?? fallback?.fetchIntervalSec ?? 120,
    terminalNotificationsEnabled: data?.terminalNotificationsEnabled ?? fallback?.terminalNotificationsEnabled ?? false,
  }
}

export function readRuntimeExternalAppSettings(data: ExternalAppsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    terminalApp: data?.terminal.pref ?? fallback?.terminalApp ?? ('auto' as TerminalPref),
    resolvedTerminalApp: data?.terminal.resolved ?? null,
    terminalAvailable: data?.terminal.available ?? false,
    terminalAppAvailability: data?.terminal.appAvailability ?? { ghostty: false, terminal: false },
    editorApp: data?.editor.pref ?? fallback?.editorApp ?? ('auto' as EditorPref),
    resolvedEditorApp: data?.editor.resolved ?? null,
    editorAvailable: data?.editor.available ?? false,
    editorAppAvailability: data?.editor.appAvailability ?? { vscode: false, cursor: false, windsurf: false },
  }
}

export function readRuntimeGeneralSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    toggleDetailOnActionBarBlankClick:
      data?.toggleDetailOnActionBarBlankClick ?? fallback?.toggleDetailOnActionBarBlankClick ?? false,
    terminalThemeSyncEnabled:
      data?.terminalThemeSyncEnabled ?? fallback?.terminalThemeSyncEnabled ?? true,
    temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
  }
}

export function readRuntimeFontSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fileTreeFontSize:
      data?.fileTreeFontSize ?? fallback?.fileTreeFontSize ?? DEFAULT_FILE_TREE_FONT_SIZE,
    fileTreeTopbarFontSize:
      data?.fileTreeTopbarFontSize ?? fallback?.fileTreeTopbarFontSize ?? DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
    terminalFontSize:
      data?.terminalFontSize ?? fallback?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
  }
}

export function readRuntimeFileAreaSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    fileTreeFontSize:
      data?.fileTreeFontSize ?? fallback?.fileTreeFontSize ?? DEFAULT_FILE_TREE_FONT_SIZE,
    fileTreeTopbarFontSize:
      data?.fileTreeTopbarFontSize ?? fallback?.fileTreeTopbarFontSize ?? DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
    fileTreeClipboardMaxBytesMb:
      data?.fileTreeClipboardMaxBytesMb ??
      fallback?.fileTreeClipboardMaxBytesMb ??
      DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  }
}

export function readRuntimeTerminalCustomButtons(data: RuntimeSettingsSnapshot | undefined) {
  return readRuntimeTerminalSettings(data).terminalCustomButtons
}

export function readRuntimeTerminalSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    terminalFontSize:
      data?.terminalFontSize ?? fallback?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
    terminalThemeSyncEnabled:
      data?.terminalThemeSyncEnabled ?? fallback?.terminalThemeSyncEnabled ?? true,
    remoteTerminalTmuxEnabled:
      data?.remoteTerminalTmuxEnabled ?? fallback?.remoteTerminalTmuxEnabled ?? false,
    temporaryFilesDirectory: data?.temporaryFilesDirectory ?? fallback?.temporaryFilesDirectory ?? '',
    terminalCustomButtonsVisible:
      data?.terminalCustomButtonsVisible ?? fallback?.terminalCustomButtonsVisible ?? true,
    terminalCustomButtonSize:
      data?.terminalCustomButtonSize ?? fallback?.terminalCustomButtonSize ?? DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
    terminalCustomButtons: data?.terminalCustomButtons ?? fallback?.terminalCustomButtons ?? [],
  }
}

export function readRuntimeLanSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    lanEnabled: data?.lanEnabled ?? fallback?.lanEnabled ?? false,
  }
}

export function readRuntimeGitNetworkSettings(data: RuntimeSettingsSnapshot | undefined) {
  const fallback = fallbackInitialSettings()
  return {
    gitNetworkProxyEnabled: data?.gitNetworkProxyEnabled ?? fallback?.gitNetworkProxyEnabled ?? false,
    gitNetworkProxyUrl: data?.gitNetworkProxyUrl ?? fallback?.gitNetworkProxyUrl ?? '',
    gitNetworkTimeoutSec:
      data?.gitNetworkTimeoutSec ?? fallback?.gitNetworkTimeoutSec ?? DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  }
}

export function getRuntimeRecentRepos() {
  return currentRuntimeRecentReposState()?.recentRepos ?? []
}

export function useRuntimeRecentRepos() {
  return useRuntimeRecentReposState()?.recentRepos ?? []
}
