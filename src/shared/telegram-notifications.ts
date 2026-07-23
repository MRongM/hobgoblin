export const TELEGRAM_BOT_TOKEN_MAX_LENGTH = 256
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 128
export const TELEGRAM_CONTEXT_TEXT_MAX_LENGTH = 300
export const TELEGRAM_OUTPUT_TAIL_MIN_LENGTH = 1
export const TELEGRAM_OUTPUT_TAIL_DEFAULT_LENGTH = 400
export const TELEGRAM_OUTPUT_TAIL_MAX_LENGTH = 4096
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096

export function normalizeTelegramOutput(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/[ \t\r\n]+/gu, ' ').trim()
  return normalized || undefined
}

export function truncateTelegramOutputTail(value: string | undefined, maxCharacters: number): string | undefined {
  if (maxCharacters < 1) return undefined
  const normalized = normalizeTelegramOutput(value)
  if (!normalized) return undefined
  const characters = Array.from(normalized)
  if (characters.length <= maxCharacters) return normalized
  const suffix = characters.slice(-maxCharacters)
  if (suffix[0] === ' ') suffix.shift()
  return suffix.join('') || undefined
}

export type TelegramNotificationContextKind = 'worktree' | 'workspace' | 'branch-workspace' | 'directory'

export interface TelegramNotificationSettingsSnapshot {
  enabled: boolean
  botTokenConfigured: boolean
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  includeTerminalOutput: boolean
  outputTailLength: number
}

export interface TelegramNotificationSettingsUpdateInput {
  enabled: boolean
  botToken?: string
  chatId: string
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  includeTerminalOutput: boolean
  outputTailLength: number
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
  outputTail?: string
}

export interface TelegramOutputCompletionNotificationContext extends TelegramBellNotificationContext {
  sessionId: string
  finalOutputSeq: number
}

export type TelegramNotificationErrorCode =
  | 'configuration-incomplete'
  | 'authentication-failed'
  | 'target-rejected'
  | 'network-failed'
  | 'telegram-rejected'
  | 'invalid-input'

export type TelegramNotificationResult = { ok: true } | { ok: false; error: { code: TelegramNotificationErrorCode } }
