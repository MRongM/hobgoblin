import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type {
  EditorAppState,
  EditorPref,
  FontFamilyPref,
  GlobalShortcutState,
  SessionState,
  TerminalCustomButton,
  TerminalCustomButtonSize,
  TerminalAppState,
  TerminalPref,
  WebAccessSettingsSnapshot,
  WebAccessSettingsUpdateInput,
} from '#/shared/rpc.ts'
import {
  addRecentRepo,
  clearRecentRepos,
  refreshExternalAppsSnapshot,
  saveSession,
  setFileTreeClipboardMaxBytesMb,
  setFontFamily,
  setFileTreeFontSize,
  setFileTreeTopbarFontSize,
  setGlobalShortcut,
  setGlobalShortcutDisabled,
  setGitNetworkProxyEnabled,
  setGitNetworkProxyUrl,
  setGitNetworkTimeoutSec,
  setLanEnabled,
  setServerPort,
  setPreferredEditorApp,
  setPreferredTerminalApp,
  setProjectColorTheme,
  setRemoteTerminalTmuxEnabled,
  setSettingsFetchInterval,
  setShortcutsDisabled,
  setSwapCloseShortcuts,
  setTemporaryFilesDirectory,
  setTerminalCustomButtons,
  setTerminalCustomButtonSize,
  setTerminalCustomButtonsVisible,
  setTerminalFontSize,
  setTerminalNotificationsEnabled,
  setTerminalThemeSyncEnabled,
  setToolbarHeightPx,
  setTopbarHeightPx,
  setWebAccessSettings,
} from '#/web/settings-client.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import {
  externalAppsQueryKey,
  lanInfoQueryKey,
  updateExternalAppsCache,
  updateRestorableSessionStateCache,
  updateRuntimeRecentReposStateCache,
  updateRuntimeSettingsSnapshotCache,
  updateSettingsSnapshotCache,
} from '#/web/settings-query-cache.ts'

export async function recordRecentRepo(repo: RepoSessionEntry): Promise<void> {
  const result = await addRecentRepo(repo)
  updateRuntimeRecentReposStateCache(mainWindowQueryClient, { recentRepos: result.recentRepos })
}

export async function clearRecentRepoHistory(): Promise<void> {
  await clearRecentRepos()
  updateRuntimeRecentReposStateCache(mainWindowQueryClient, { recentRepos: [] })
}

export async function persistSessionState(session: SessionState): Promise<void> {
  const savedSession = await saveSession(session)
  updateRestorableSessionStateCache(mainWindowQueryClient, savedSession)
}

export async function setFetchIntervalPreference(sec: number): Promise<number> {
  const fetchIntervalSec = await setSettingsFetchInterval(sec)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fetchIntervalSec }))
  return fetchIntervalSec
}

export async function setWebAccessSettingsPreference(
  input: WebAccessSettingsUpdateInput,
): Promise<WebAccessSettingsSnapshot> {
  const webAccess = await setWebAccessSettings(input)
  updateSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, webAccess }))
  return webAccess
}

export async function setTerminalNotificationsEnabledPreference(enabled: boolean): Promise<void> {
  await setTerminalNotificationsEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    terminalNotificationsEnabled: enabled,
  }))
}

export async function setShortcutsDisabledPreference(disabled: boolean): Promise<void> {
  await setShortcutsDisabled(disabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, shortcutsDisabled: disabled }))
}

export async function setGlobalShortcutDisabledPreference(disabled: boolean): Promise<void> {
  await setGlobalShortcutDisabled(disabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    globalShortcutDisabled: disabled,
  }))
}

export async function setSwapCloseShortcutsPreference(swapped: boolean): Promise<void> {
  await setSwapCloseShortcuts(swapped)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, swapCloseShortcuts: swapped }))
}

export async function setTerminalThemeSyncEnabledPreference(enabled: boolean): Promise<void> {
  await setTerminalThemeSyncEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    terminalThemeSyncEnabled: enabled,
  }))
}

export async function setTemporaryFilesDirectoryPreference(path: string): Promise<void> {
  await setTemporaryFilesDirectory(path)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    temporaryFilesDirectory: path,
  }))
}

export async function setGlobalShortcutPreference(accelerator: string): Promise<GlobalShortcutState> {
  const state = await setGlobalShortcut(accelerator)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    globalShortcut: state.accelerator,
    globalShortcutRegistered: state.registered,
  }))
  return state
}

export async function setTerminalAppPreference(pref: TerminalPref): Promise<TerminalAppState> {
  const state = await setPreferredTerminalApp(pref)
  updateExternalAppsCache(mainWindowQueryClient, (current) => ({ ...current, terminal: state }))
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, terminalApp: state.pref }))
  return state
}

export async function setEditorAppPreference(pref: EditorPref): Promise<EditorAppState> {
  const state = await setPreferredEditorApp(pref)
  updateExternalAppsCache(mainWindowQueryClient, (current) => ({ ...current, editor: state }))
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, editorApp: state.pref }))
  return state
}

export async function setFileTreeFontSizePreference(fontSize: number): Promise<number> {
  const fileTreeFontSize = await setFileTreeFontSize(fontSize)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fileTreeFontSize }))
  return fileTreeFontSize
}

export async function setTopbarHeightPxPreference(heightPx: number): Promise<number> {
  const topbarHeightPx = await setTopbarHeightPx(heightPx)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, topbarHeightPx }))
  return topbarHeightPx
}

export async function setToolbarHeightPxPreference(heightPx: number): Promise<number> {
  const toolbarHeightPx = await setToolbarHeightPx(heightPx)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, toolbarHeightPx }))
  return toolbarHeightPx
}

export async function setFileTreeTopbarFontSizePreference(fontSize: number): Promise<number> {
  const fileTreeTopbarFontSize = await setFileTreeTopbarFontSize(fontSize)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fileTreeTopbarFontSize }))
  return fileTreeTopbarFontSize
}

export async function setFileTreeClipboardMaxBytesMbPreference(value: number): Promise<number> {
  const fileTreeClipboardMaxBytesMb = await setFileTreeClipboardMaxBytesMb(value)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fileTreeClipboardMaxBytesMb }))
  return fileTreeClipboardMaxBytesMb
}

export async function setTerminalFontSizePreference(fontSize: number): Promise<number> {
  const terminalFontSize = await setTerminalFontSize(fontSize)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, terminalFontSize }))
  return terminalFontSize
}

export async function setFontFamilyPreference(fontFamily: FontFamilyPref): Promise<FontFamilyPref> {
  const nextFontFamily = await setFontFamily(fontFamily)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, fontFamily: nextFontFamily }))
  return nextFontFamily
}

export async function setProjectColorThemePreference(
  repoId: string,
  colorTheme: Parameters<typeof setProjectColorTheme>[1],
): Promise<void> {
  const repoSettings = await setProjectColorTheme(repoId, colorTheme)
  updateSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    repoSettings,
  }))
}

export async function setRemoteTerminalTmuxEnabledPreference(enabled: boolean): Promise<void> {
  await setRemoteTerminalTmuxEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    remoteTerminalTmuxEnabled: enabled,
  }))
}

export async function setTerminalCustomButtonsVisiblePreference(visible: boolean): Promise<void> {
  await setTerminalCustomButtonsVisible(visible)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    terminalCustomButtonsVisible: visible,
  }))
}

export async function setTerminalCustomButtonSizePreference(size: TerminalCustomButtonSize): Promise<void> {
  await setTerminalCustomButtonSize(size)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    terminalCustomButtonSize: size,
  }))
}

export async function setTerminalCustomButtonsPreference(
  buttons: TerminalCustomButton[],
): Promise<TerminalCustomButton[]> {
  const terminalCustomButtons = await setTerminalCustomButtons(buttons)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, terminalCustomButtons }))
  return terminalCustomButtons
}

export async function refreshExternalAppsDetection(): Promise<void> {
  const state = await refreshExternalAppsSnapshot()
  mainWindowQueryClient.setQueryData(externalAppsQueryKey(), state)
}

export async function setLanEnabledPreference(enabled: boolean): Promise<void> {
  await setLanEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, lanEnabled: enabled }))
  void mainWindowQueryClient.invalidateQueries({ queryKey: lanInfoQueryKey() })
}

export async function setServerPortPreference(port: number): Promise<void> {
  await setServerPort(port)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({ ...current, serverPort: port }))
}

export async function setGitNetworkProxyEnabledPreference(enabled: boolean): Promise<void> {
  await setGitNetworkProxyEnabled(enabled)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkProxyEnabled: enabled,
  }))
}

export async function setGitNetworkProxyUrlPreference(url: string): Promise<void> {
  await setGitNetworkProxyUrl(url)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkProxyUrl: url,
  }))
}

export async function setGitNetworkTimeoutSecPreference(sec: number): Promise<void> {
  await setGitNetworkTimeoutSec(sec)
  updateRuntimeSettingsSnapshotCache(mainWindowQueryClient, (current) => ({
    ...current,
    gitNetworkTimeoutSec: sec,
  }))
}

export async function runSettingsControllerAction<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task()
  } catch (err) {
    console.warn(`[settings] ${label} failed`, err)
    return null
  }
}
