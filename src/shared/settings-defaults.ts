import { DEFAULT_GLOBAL_SHORTCUT } from '#/shared/accelerator.ts'
import { DEFAULT_COLOR_THEME, type ColorTheme } from '#/shared/color-theme.ts'
import type { InitialSettingsSnapshot } from '#/shared/bootstrap.ts'
import type {
  EditorPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  SettingsSnapshot,
  TerminalCustomButton,
  TerminalCustomButtonSize,
  TerminalPref,
  ThemePref,
} from '#/shared/rpc.ts'
import {
  MAX_FILE_TREE_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from '#/shared/settings.ts'
import {
  DEFAULT_DETAIL_COLLAPSED,
  DEFAULT_DETAIL_FOCUS_MODE,
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_FILE_TREE_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
} from '#/shared/workspace-layout.ts'

export const DEFAULT_FETCH_INTERVAL_SEC = 120
export const MAX_RECENT_REPOS = 10
export const DEFAULT_LANG_PREF: LangPref = 'auto'
export const DEFAULT_THEME_PREF: ThemePref = 'auto'
export const DEFAULT_SESSION_DETAIL_FOCUS_MODE = DEFAULT_DETAIL_FOCUS_MODE
export const DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED = false
export const DEFAULT_SHORTCUTS_DISABLED = false
export const DEFAULT_GLOBAL_SHORTCUT_DISABLED = false
export const DEFAULT_SWAP_CLOSE_SHORTCUTS = false
export const DEFAULT_TOGGLE_DETAIL_ON_ACTION_BAR_BLANK_CLICK = false
export const DEFAULT_TEMPORARY_FILES_DIRECTORY = ''
export const DEFAULT_TERMINAL_APP: TerminalPref = 'auto'
export const DEFAULT_EDITOR_APP: EditorPref = 'auto'
export const DEFAULT_FILE_TREE_FONT_SIZE = 14
export const DEFAULT_TERMINAL_FONT_SIZE = 14
export const DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED = false
export const DEFAULT_REMOTE_TERMINAL_TMUX_ENABLED = false
export const DEFAULT_TERMINAL_CUSTOM_BUTTONS_VISIBLE = true
export const DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE: TerminalCustomButtonSize = 'medium'
export const DEFAULT_TERMINAL_CUSTOM_BUTTONS: TerminalCustomButton[] = []
export const DEFAULT_LAN_ENABLED = false

export function defaultSessionState(): SessionState {
  return {
    openRepos: [],
    activeRepo: null,
    detailCollapsed: DEFAULT_DETAIL_COLLAPSED,
    detailFocusMode: DEFAULT_DETAIL_FOCUS_MODE,
    workspaceLayout: DEFAULT_WORKSPACE_LAYOUT,
    detailPaneSizes: { ...DEFAULT_DETAIL_PANE_SIZES },
    fileTreePaneSizes: { ...DEFAULT_FILE_TREE_PANE_SIZES },
    selectedTerminalByWorktree: {},
  }
}

export function defaultSettingsPrefs(overrides: Partial<SettingsPrefs> = {}): SettingsPrefs {
  return {
    lang: overrides.lang ?? DEFAULT_LANG_PREF,
    theme: overrides.theme ?? DEFAULT_THEME_PREF,
    colorTheme: overrides.colorTheme ?? DEFAULT_COLOR_THEME,
    fetchIntervalSec: overrides.fetchIntervalSec ?? DEFAULT_FETCH_INTERVAL_SEC,
    terminalNotificationsEnabled: overrides.terminalNotificationsEnabled ?? DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED,
    shortcutsDisabled: overrides.shortcutsDisabled ?? DEFAULT_SHORTCUTS_DISABLED,
    globalShortcutDisabled: overrides.globalShortcutDisabled ?? DEFAULT_GLOBAL_SHORTCUT_DISABLED,
    swapCloseShortcuts: overrides.swapCloseShortcuts ?? DEFAULT_SWAP_CLOSE_SHORTCUTS,
    toggleDetailOnActionBarBlankClick:
      overrides.toggleDetailOnActionBarBlankClick ?? DEFAULT_TOGGLE_DETAIL_ON_ACTION_BAR_BLANK_CLICK,
    temporaryFilesDirectory:
      overrides.temporaryFilesDirectory ?? DEFAULT_TEMPORARY_FILES_DIRECTORY,
    globalShortcut: overrides.globalShortcut ?? DEFAULT_GLOBAL_SHORTCUT,
    terminalApp: overrides.terminalApp ?? DEFAULT_TERMINAL_APP,
    editorApp: overrides.editorApp ?? DEFAULT_EDITOR_APP,
    fileTreeFontSize: overrides.fileTreeFontSize ?? DEFAULT_FILE_TREE_FONT_SIZE,
    terminalFontSize: overrides.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE,
    terminalExternalInputEnabled:
      overrides.terminalExternalInputEnabled ?? DEFAULT_TERMINAL_EXTERNAL_INPUT_ENABLED,
    remoteTerminalTmuxEnabled:
      overrides.remoteTerminalTmuxEnabled ?? DEFAULT_REMOTE_TERMINAL_TMUX_ENABLED,
    terminalCustomButtonsVisible:
      overrides.terminalCustomButtonsVisible ?? DEFAULT_TERMINAL_CUSTOM_BUTTONS_VISIBLE,
    terminalCustomButtonSize:
      overrides.terminalCustomButtonSize ?? DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
    terminalCustomButtons: overrides.terminalCustomButtons ?? DEFAULT_TERMINAL_CUSTOM_BUTTONS,
    lanEnabled: overrides.lanEnabled ?? DEFAULT_LAN_ENABLED,
  }
}

export function defaultSettingsSnapshot(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  const prefs = defaultSettingsPrefs(overrides)
  return {
    ...prefs,
    globalShortcutRegistered: overrides.globalShortcutRegistered ?? false,
    session: overrides.session ?? defaultSessionState(),
    recentRepos: overrides.recentRepos ?? [],
  }
}

export function initialSettingsFromSnapshot(snapshot: Pick<
  SettingsSnapshot,
  | 'fetchIntervalSec'
  | 'terminalNotificationsEnabled'
  | 'shortcutsDisabled'
  | 'globalShortcutDisabled'
  | 'swapCloseShortcuts'
  | 'toggleDetailOnActionBarBlankClick'
  | 'temporaryFilesDirectory'
  | 'globalShortcut'
  | 'globalShortcutRegistered'
  | 'terminalApp'
  | 'editorApp'
  | 'fileTreeFontSize'
  | 'terminalFontSize'
  | 'terminalExternalInputEnabled'
  | 'remoteTerminalTmuxEnabled'
  | 'terminalCustomButtonsVisible'
  | 'terminalCustomButtonSize'
  | 'terminalCustomButtons'
  | 'lanEnabled'
>): InitialSettingsSnapshot {
  return {
    fetchIntervalSec: snapshot.fetchIntervalSec,
    terminalNotificationsEnabled: snapshot.terminalNotificationsEnabled,
    shortcutsDisabled: snapshot.shortcutsDisabled,
    globalShortcutDisabled: snapshot.globalShortcutDisabled,
    swapCloseShortcuts: snapshot.swapCloseShortcuts,
    toggleDetailOnActionBarBlankClick: snapshot.toggleDetailOnActionBarBlankClick,
    temporaryFilesDirectory: snapshot.temporaryFilesDirectory,
    globalShortcut: snapshot.globalShortcut,
    globalShortcutRegistered: snapshot.globalShortcutRegistered,
    terminalApp: snapshot.terminalApp,
    editorApp: snapshot.editorApp,
    fileTreeFontSize: snapshot.fileTreeFontSize,
    terminalFontSize: snapshot.terminalFontSize,
    terminalExternalInputEnabled: snapshot.terminalExternalInputEnabled,
    remoteTerminalTmuxEnabled: snapshot.remoteTerminalTmuxEnabled,
    terminalCustomButtonsVisible: snapshot.terminalCustomButtonsVisible,
    terminalCustomButtonSize: snapshot.terminalCustomButtonSize,
    terminalCustomButtons: snapshot.terminalCustomButtons,
    lanEnabled: snapshot.lanEnabled,
  }
}

export function defaultInitialSettingsSnapshot(overrides: Partial<InitialSettingsSnapshot> = {}): InitialSettingsSnapshot {
  return initialSettingsFromSnapshot(defaultSettingsSnapshot(overrides))
}

export { DEFAULT_COLOR_THEME, DEFAULT_GLOBAL_SHORTCUT }
export {
  MAX_FILE_TREE_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
}
export type { ColorTheme }
