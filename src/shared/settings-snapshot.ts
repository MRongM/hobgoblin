import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { RepoSettingsEntry } from '#/shared/repo-settings.ts'
import type {
  RuntimeRecentReposState,
  RuntimeSettingsSnapshot,
  SessionState,
  SettingsPrefs,
  SettingsSnapshot,
  WebAccessSettingsSnapshot,
} from '#/shared/rpc.ts'
import type { TelegramNotificationSettingsSnapshot } from '#/shared/telegram-notifications.ts'

export function buildRuntimeSettingsSnapshot(input: {
  prefs: SettingsPrefs
  globalShortcutRegistered: boolean
}): RuntimeSettingsSnapshot {
  return {
    lang: input.prefs.lang,
    theme: input.prefs.theme,
    colorTheme: input.prefs.colorTheme,
    fontFamily: input.prefs.fontFamily,
    fetchIntervalSec: input.prefs.fetchIntervalSec,
    gitNetworkProxyEnabled: input.prefs.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: input.prefs.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: input.prefs.gitNetworkTimeoutSec,
    terminalNotificationsEnabled: input.prefs.terminalNotificationsEnabled,
    shortcutsDisabled: input.prefs.shortcutsDisabled,
    globalShortcutDisabled: input.prefs.globalShortcutDisabled,
    swapCloseShortcuts: input.prefs.swapCloseShortcuts,
    terminalThemeSyncEnabled: input.prefs.terminalThemeSyncEnabled,
    temporaryFilesDirectory: input.prefs.temporaryFilesDirectory,
    globalShortcut: input.prefs.globalShortcut,
    globalShortcutRegistered: input.globalShortcutRegistered,
    terminalApp: input.prefs.terminalApp,
    editorApp: input.prefs.editorApp,
    topbarHeightPx: input.prefs.topbarHeightPx,
    toolbarHeightPx: input.prefs.toolbarHeightPx,
    fileTreeFontSize: input.prefs.fileTreeFontSize,
    fileTreeTopbarFontSize: input.prefs.fileTreeTopbarFontSize,
    fileTreeClipboardMaxBytesMb: input.prefs.fileTreeClipboardMaxBytesMb,
    terminalFontSize: input.prefs.terminalFontSize,
    terminalCustomButtonsVisible: input.prefs.terminalCustomButtonsVisible,
    terminalCustomButtonSize: input.prefs.terminalCustomButtonSize,
    terminalCustomButtons: input.prefs.terminalCustomButtons,
    lanEnabled: input.prefs.lanEnabled,
    serverPort: input.prefs.serverPort,
  }
}

export function buildRuntimeRecentReposState(input: { recentRepos: RepoSessionEntry[] }): RuntimeRecentReposState {
  return {
    recentRepos: input.recentRepos,
  }
}

export function buildSettingsSnapshot(input: {
  prefs: SettingsPrefs
  globalShortcutRegistered: boolean
  session: SessionState
  recentRepos: RepoSessionEntry[]
  repoSettings: RepoSettingsEntry[]
  webAccess: WebAccessSettingsSnapshot
  telegramNotifications: TelegramNotificationSettingsSnapshot
}): SettingsSnapshot {
  return {
    ...buildRuntimeSettingsSnapshot({
      prefs: input.prefs,
      globalShortcutRegistered: input.globalShortcutRegistered,
    }),
    ...buildRuntimeRecentReposState({ recentRepos: input.recentRepos }),
    session: input.session,
    repoSettings: input.repoSettings,
    webAccess: input.webAccess,
    telegramNotifications: input.telegramNotifications,
  }
}

export function runtimeSettingsSnapshotFromSettingsSnapshot(
  snapshot: Pick<
    SettingsSnapshot,
    | 'lang'
    | 'theme'
    | 'colorTheme'
    | 'fontFamily'
    | 'fetchIntervalSec'
    | 'gitNetworkProxyEnabled'
    | 'gitNetworkProxyUrl'
    | 'gitNetworkTimeoutSec'
    | 'terminalNotificationsEnabled'
    | 'shortcutsDisabled'
    | 'globalShortcutDisabled'
    | 'swapCloseShortcuts'
    | 'terminalThemeSyncEnabled'
    | 'temporaryFilesDirectory'
    | 'globalShortcut'
    | 'globalShortcutRegistered'
    | 'terminalApp'
    | 'editorApp'
    | 'topbarHeightPx'
    | 'toolbarHeightPx'
    | 'fileTreeFontSize'
    | 'fileTreeTopbarFontSize'
    | 'fileTreeClipboardMaxBytesMb'
    | 'terminalFontSize'
    | 'terminalCustomButtonsVisible'
    | 'terminalCustomButtonSize'
    | 'terminalCustomButtons'
    | 'lanEnabled'
    | 'serverPort'
  >,
): RuntimeSettingsSnapshot {
  return {
    lang: snapshot.lang,
    theme: snapshot.theme,
    colorTheme: snapshot.colorTheme,
    fontFamily: snapshot.fontFamily,
    fetchIntervalSec: snapshot.fetchIntervalSec,
    gitNetworkProxyEnabled: snapshot.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: snapshot.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: snapshot.gitNetworkTimeoutSec,
    terminalNotificationsEnabled: snapshot.terminalNotificationsEnabled,
    shortcutsDisabled: snapshot.shortcutsDisabled,
    globalShortcutDisabled: snapshot.globalShortcutDisabled,
    swapCloseShortcuts: snapshot.swapCloseShortcuts,
    terminalThemeSyncEnabled: snapshot.terminalThemeSyncEnabled,
    temporaryFilesDirectory: snapshot.temporaryFilesDirectory,
    globalShortcut: snapshot.globalShortcut,
    globalShortcutRegistered: snapshot.globalShortcutRegistered,
    terminalApp: snapshot.terminalApp,
    editorApp: snapshot.editorApp,
    topbarHeightPx: snapshot.topbarHeightPx,
    toolbarHeightPx: snapshot.toolbarHeightPx,
    fileTreeFontSize: snapshot.fileTreeFontSize,
    fileTreeTopbarFontSize: snapshot.fileTreeTopbarFontSize,
    fileTreeClipboardMaxBytesMb: snapshot.fileTreeClipboardMaxBytesMb,
    terminalFontSize: snapshot.terminalFontSize,
    terminalCustomButtonsVisible: snapshot.terminalCustomButtonsVisible,
    terminalCustomButtonSize: snapshot.terminalCustomButtonSize,
    terminalCustomButtons: snapshot.terminalCustomButtons,
    lanEnabled: snapshot.lanEnabled,
    serverPort: snapshot.serverPort,
  }
}

export function runtimeRecentReposStateFromSettingsSnapshot(
  snapshot: Pick<SettingsSnapshot, 'recentRepos'>,
): RuntimeRecentReposState {
  return {
    recentRepos: snapshot.recentRepos,
  }
}

export function restorableSessionStateFromSettingsSnapshot(snapshot: Pick<SettingsSnapshot, 'session'>): SessionState {
  return snapshot.session
}
