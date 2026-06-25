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
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24

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
  terminalFontSize: number
  terminalExternalInputEnabled: boolean
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
}
