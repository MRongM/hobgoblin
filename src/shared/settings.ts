import type { ColorTheme } from '#/shared/color-theme.ts'

export type ThemePref = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type FontFamilyPref = 'mono' | 'maple' | 'system'
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
export const MIN_APP_FONT_SIZE = MIN_FILE_TREE_FONT_SIZE
export const MAX_APP_FONT_SIZE = MAX_FILE_TREE_FONT_SIZE
export const MIN_FILE_TREE_TOPBAR_FONT_SIZE = 10
export const MAX_FILE_TREE_TOPBAR_FONT_SIZE = 18
export const DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 30
export const MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 1
export const MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB = 100
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24
export const MIN_GIT_NETWORK_TIMEOUT_SEC = 15
export const MAX_GIT_NETWORK_TIMEOUT_SEC = 900
export const MIN_SERVER_PORT = 1024
export const MAX_SERVER_PORT = 65535

export {
  DEFAULT_TOPBAR_HEIGHT_PX,
  DEFAULT_TOOLBAR_HEIGHT_PX,
  MIN_CHROME_HEIGHT_PX,
  MAX_CHROME_HEIGHT_PX,
} from '#/shared/window-chrome.ts'

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
  fontFamily: FontFamilyPref
  lang: LangPref
  fetchIntervalSec: number
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
  terminalNotificationsEnabled: boolean
  shortcutsDisabled: boolean
  globalShortcutDisabled: boolean
  swapCloseShortcuts: boolean
  terminalThemeSyncEnabled: boolean
  temporaryFilesDirectory: string
  globalShortcut: string
  terminalApp: TerminalPref
  editorApp: EditorPref
  topbarHeightPx: number
  toolbarHeightPx: number
  fileTreeFontSize: number
  fileTreeTopbarFontSize: number
  fileTreeClipboardMaxBytesMb: number
  terminalFontSize: number
  localTerminalTmuxEnabled: boolean
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
  serverPort: number
}
