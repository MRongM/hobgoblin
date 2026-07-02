import type { ColorTheme } from '#/shared/color-theme.ts'

export type ThemePref = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type LangPref = 'auto' | 'en' | 'zh' | 'ko' | 'ja'
export type Lang = 'en' | 'zh' | 'ko' | 'ja'
export type TerminalPref = 'auto' | 'ghostty' | 'terminal'
export type EditorPref = 'auto' | 'vscode' | 'cursor' | 'windsurf'
export type ResolvedTerminalApp = Exclude<TerminalPref, 'auto'>
export type ResolvedEditorApp = Exclude<EditorPref, 'auto'>
export type TerminalAppAvailability = Record<ResolvedTerminalApp, boolean>
export type EditorAppAvailability = Record<ResolvedEditorApp, boolean>

export const MIN_FILE_TREE_FONT_SIZE = 10
export const MAX_FILE_TREE_FONT_SIZE = 18
export const MIN_FILE_TREE_TOPBAR_FONT_SIZE = 10
export const MAX_FILE_TREE_TOPBAR_FONT_SIZE = 18
export const DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 30
export const MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 1
export const MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 100
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24
export const MIN_GIT_NETWORK_TIMEOUT_SEC = 15
export const MAX_GIT_NETWORK_TIMEOUT_SEC = 900

export type TerminalCustomButtonAction = 'execute' | 'input'
export type TerminalCustomButtonSize = 'small' | 'medium' | 'large'

export interface TerminalCustomButton {
  label: string
  value: string
  action?: TerminalCustomButtonAction
}

export interface SettingsPrefs {
  theme: ThemePref
  colorTheme: ColorTheme
  lang: LangPref
  fetchIntervalSec: number
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
  terminalNotificationsEnabled: boolean
  shortcutsDisabled: boolean
  globalShortcutDisabled: boolean
  swapCloseShortcuts: boolean
  toggleDetailOnActionBarBlankClick: boolean
  terminalThemeSyncEnabled: boolean
  temporaryFilesDirectory: string
  globalShortcut: string
  terminalApp: TerminalPref
  editorApp: EditorPref
  fileTreeFontSize: number
  fileTreeTopbarFontSize: number
  fileTreeClipboardMaxBytesMb: number
  terminalFontSize: number
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
}
