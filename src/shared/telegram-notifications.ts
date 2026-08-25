export const TELEGRAM_BOT_TOKEN_MAX_LENGTH = 256
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 128
export const TELEGRAM_CONTEXT_TEXT_MAX_LENGTH = 300
export const TELEGRAM_OUTPUT_TAIL_MIN_LENGTH = 1
import type { TelegramTerminalInputRuntimeSnapshot } from '#/shared/telegram-terminal-input.ts'

export const TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH = 400
export const TELEGRAM_OUTPUT_TAIL_MAX_LENGTH = 4096
export const TELEGRAM_OUTPUT_COMPLETION_MIN_ACTIVITY_SECONDS = 1
export const TELEGRAM_OUTPUT_COMPLETION_DEFAULT_ACTIVITY_SECONDS = 10
export const TELEGRAM_OUTPUT_COMPLETION_MAX_ACTIVITY_SECONDS = 3_600
export const TELEGRAM_PHOTO_CAPTION_MAX_LENGTH = 1024
export const TELEGRAM_PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const TELEGRAM_TERMINAL_SCREEN_MAX_COLUMNS = 140
export const TELEGRAM_TERMINAL_SCREEN_MAX_ROWS = 40

export type TelegramNotificationContextKind = 'worktree' | 'workspace' | 'branch-workspace' | 'directory'

export interface TelegramNotificationSettingsSnapshot {
  enabled: boolean
  botTokenConfigured: boolean
  chatId: string
  proxyEnabled: boolean
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  outputCompletionMinimumActivitySeconds: number
  includeTerminalOutput: boolean
  outputTailLength: number
  terminalInputEnabled: boolean
  terminalInputAllowedUserIds: string[]
  terminalInputPollingTimeoutSeconds: number
  terminalInputRuntime: TelegramTerminalInputRuntimeSnapshot
}

export interface TelegramNotificationSettingsUpdateInput {
  enabled: boolean
  botToken?: string
  chatId: string
  proxyEnabled?: boolean
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  outputCompletionMinimumActivitySeconds: number
  includeTerminalOutput: boolean
  outputTailLength: number
  terminalInputEnabled?: boolean
  terminalInputAllowedUserIds?: string[]
  terminalInputPollingTimeoutSeconds?: number
}

export interface TelegramBellNotificationContext {
  terminalKey: string
  project: string
  contextKind: TelegramNotificationContextKind
  context: string
  directory: string
  branch?: string
  terminalIndex: number
  terminalTitle?: string
  sessionId?: string
}

export interface TelegramOutputCompletionNotificationContext extends TelegramBellNotificationContext {
  sessionId: string
  finalOutputSeq: number
  activityDurationMs: number
}

export type TelegramNotificationErrorCode =
  | 'configuration-incomplete'
  | 'authentication-failed'
  | 'target-rejected'
  | 'network-failed'
  | 'telegram-rejected'
  | 'invalid-input'

export type TelegramNotificationResult = { ok: true } | { ok: false; error: { code: TelegramNotificationErrorCode } }
