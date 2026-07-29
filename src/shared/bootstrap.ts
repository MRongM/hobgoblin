import type {
  EditorPref,
  FontFamilyPref,
  I18nSnapshot,
  TerminalCustomButton,
  TerminalCustomButtonSize,
  TerminalPref,
} from '#/shared/rpc.ts'
import type { RendererSurfaceBootstrap } from '#/shared/file-area.ts'

export type RendererRuntimeKind = 'electron' | 'web'
export type RendererNativeCapability =
  | 'settings-rpc'
  | 'open-settings-window'
  | 'open-external-url'
  | 'open-directory-dialog'
  | 'open-file-dialog'
  | 'consume-external-open-paths'
  | 'open-in-finder'
  | 'clipboard-file-paths'
  | 'clipboard-binary-temp-files'
  | 'file-tree-clipboard'
  | 'terminal-notifications'
  | 'terminal-badge'
  | 'open-detached-file-area-window'

export const RENDERER_BRIDGE_VERSION = 1
export const ELECTRON_RENDERER_CAPABILITIES = [
  'settings-rpc',
  'open-settings-window',
  'open-external-url',
  'open-directory-dialog',
  'open-file-dialog',
  'consume-external-open-paths',
  'open-in-finder',
  'clipboard-file-paths',
  'clipboard-binary-temp-files',
  'file-tree-clipboard',
  'terminal-notifications',
  'terminal-badge',
  'open-detached-file-area-window',
] as const satisfies readonly RendererNativeCapability[]
export const WEB_RENDERER_CAPABILITIES = [] as const satisfies readonly RendererNativeCapability[]

export interface InitialSettingsSnapshot {
  fetchIntervalSec: number
  fontFamily: FontFamilyPref
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
  globalShortcutRegistered: boolean
  terminalApp: TerminalPref
  editorApp: EditorPref
  topbarHeightPx: number
  toolbarHeightPx: number
  fileTreeFontSize: number
  fileTreeClipboardMaxBytesMb: number
  terminalFontSize: number
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
  serverPort: number
}

export interface InitialServerSnapshot {
  url: string
  secret: string
  clientId?: string
}

export interface RendererRuntimeSnapshot {
  kind: RendererRuntimeKind
  bridgeVersion: number
  capabilities: readonly RendererNativeCapability[]
}

export interface RendererBootstrapPayload {
  runtime: RendererRuntimeSnapshot
  homeDir: string
  hostPlatform?: NodeJS.Platform
  i18n: I18nSnapshot
  settings: InitialSettingsSnapshot
  server: InitialServerSnapshot | null
  surface: RendererSurfaceBootstrap
}

export interface RendererBootstrapSnapshot {
  runtime: RendererRuntimeSnapshot
  homeDir: string
  /** Host running repository and tmux commands; absent only in legacy or test bootstraps. */
  hostPlatform?: NodeJS.Platform
  initialI18n: I18nSnapshot | null
  initialSettings: InitialSettingsSnapshot | null
  initialServer: InitialServerSnapshot | null
  /** Absent only for legacy or test-injected bootstraps; renderers normalize it to the main surface. */
  surface?: RendererSurfaceBootstrap
}
