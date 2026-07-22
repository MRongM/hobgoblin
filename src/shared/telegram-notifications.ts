export const TELEGRAM_BOT_TOKEN_MAX_LENGTH = 256
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 128
export const TELEGRAM_CONTEXT_TEXT_MAX_LENGTH = 300

export type TelegramNotificationContextKind = 'worktree' | 'workspace' | 'branch-workspace' | 'directory'

export interface TelegramNotificationSettingsSnapshot {
  enabled: boolean
  botTokenConfigured: boolean
  chatId: string
}

export interface TelegramNotificationSettingsUpdateInput {
  enabled: boolean
  botToken?: string
  chatId: string
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
}

export type TelegramNotificationErrorCode =
  | 'configuration-incomplete'
  | 'authentication-failed'
  | 'target-rejected'
  | 'network-failed'
  | 'telegram-rejected'
  | 'invalid-input'

export type TelegramNotificationResult = { ok: true } | { ok: false; error: { code: TelegramNotificationErrorCode } }
