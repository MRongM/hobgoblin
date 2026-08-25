export const TELEGRAM_TERMINAL_INPUT_ALLOWED_USER_IDS_MAX = 32
export const TELEGRAM_TERMINAL_INPUT_MAX_CODE_POINTS = 4_000
export const TELEGRAM_TERMINAL_INPUT_MAX_AGE_SECONDS = 60
export const TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_MIN_SECONDS = 5
export const TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_DEFAULT_SECONDS = 25
export const TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_MAX_SECONDS = 50

export type TelegramTerminalInputPollingStatus = 'stopped' | 'starting' | 'running' | 'retrying' | 'error'

export type TelegramTerminalInputPollingErrorCode =
  | 'configuration-incomplete'
  | 'authentication-failed'
  | 'invalid-chat'
  | 'webhook-conflict'
  | 'network-failed'
  | 'telegram-rejected'

export interface TelegramTerminalInputRuntimeSnapshot {
  status: TelegramTerminalInputPollingStatus
  errorCode?: TelegramTerminalInputPollingErrorCode
  botUsername?: string
}

export type TelegramTerminalInputSubmissionResult =
  | { ok: true; terminal: { index: number; title?: string } }
  | { ok: false; code: 'no-target' | 'target-lost' | 'write-failed' }

export interface TelegramTerminalInputParseOptions {
  botUsername: string
  chatId: string
  allowedUserIds: readonly string[]
  receiverReadyAtSeconds: number
  nowSeconds: number
}

export type TelegramTerminalInputRejectionReason = 'unauthorized-sender' | 'expired' | 'invalid-input'

interface TelegramTerminalInputMessageIdentity {
  updateId: number
  chatId: string
  messageId: number
  messageThreadId?: number
}

export type TelegramTerminalInputParseResult =
  | { kind: 'ignored' }
  | (TelegramTerminalInputMessageIdentity & {
      kind: 'rejected'
      reason: TelegramTerminalInputRejectionReason
    })
  | (TelegramTerminalInputMessageIdentity & {
      kind: 'accepted'
      text: string
    })

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function decimalId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[1-9]\d{0,19}$/u.test(trimmed) ? trimmed : null
}

function chatId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^-?\d+$/u.test(trimmed) ? trimmed : null
}

export function normalizeTelegramTerminalInputAllowedUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const normalized = decimalId(item)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= TELEGRAM_TERMINAL_INPUT_ALLOWED_USER_IDS_MAX) break
  }
  return result
}

export function normalizeTelegramTerminalInputPollTimeoutSeconds(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_MIN_SECONDS ||
    value > TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_MAX_SECONDS
  ) {
    return TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_DEFAULT_SECONDS
  }
  return value
}

function messageIdentity(updateId: number, message: UnknownRecord, parsedChatId: string) {
  const messageId = positiveInteger(message.message_id)
  if (!messageId) return null
  const messageThreadId = positiveInteger(message.message_thread_id)
  return {
    updateId,
    chatId: parsedChatId,
    messageId,
    ...(messageThreadId ? { messageThreadId } : {}),
  }
}

function exactLeadingMention(text: string, entities: unknown, botUsername: string): { end: number } | null {
  if (!Array.isArray(entities)) return null
  const normalizedUsername = botUsername.trim().replace(/^@/u, '').toLowerCase()
  if (!normalizedUsername) return null
  for (const rawEntity of entities) {
    const entity = record(rawEntity)
    if (!entity || entity.type !== 'mention') continue
    const offset = typeof entity.offset === 'number' && Number.isInteger(entity.offset) ? entity.offset : -1
    const length = typeof entity.length === 'number' && Number.isInteger(entity.length) ? entity.length : -1
    if (offset < 0 || length < 2 || offset + length > text.length) continue
    const prefix = text.slice(0, offset)
    if (prefix.trim().length > 0) continue
    const mention = text.slice(offset, offset + length)
    if (mention.toLowerCase() !== `@${normalizedUsername}`) continue
    return { end: offset + length }
  }
  return null
}

export function parseTelegramTerminalInputUpdate(
  value: unknown,
  options: TelegramTerminalInputParseOptions,
): TelegramTerminalInputParseResult {
  const update = record(value)
  const updateId =
    update && typeof update.update_id === 'number' && Number.isSafeInteger(update.update_id) ? update.update_id : null
  const message = update ? record(update.message) : null
  if (updateId === null || !message) return { kind: 'ignored' }

  const chat = record(message.chat)
  const parsedChatId = chatId(chat?.id)
  if (
    !chat ||
    !parsedChatId ||
    parsedChatId !== options.chatId ||
    (chat.type !== 'group' && chat.type !== 'supergroup')
  ) {
    return { kind: 'ignored' }
  }

  const text = typeof message.text === 'string' ? message.text : null
  if (!text) return { kind: 'ignored' }
  const mention = exactLeadingMention(text, message.entities, options.botUsername)
  if (!mention) return { kind: 'ignored' }

  const identity = messageIdentity(updateId, message, parsedChatId)
  if (!identity) return { kind: 'ignored' }
  const sender = record(message.from)
  const senderId = decimalId(sender?.id)
  if (!senderId || sender?.is_bot === true || !options.allowedUserIds.includes(senderId)) {
    return { kind: 'rejected', reason: 'unauthorized-sender', ...identity }
  }

  if (message.sender_chat !== undefined || message.forward_origin !== undefined || message.forward_date !== undefined) {
    return { kind: 'rejected', reason: 'invalid-input', ...identity }
  }

  if (/[\u0000-\u001f\u007f\u2028\u2029]/u.test(text)) {
    return { kind: 'rejected', reason: 'invalid-input', ...identity }
  }

  const date = typeof message.date === 'number' && Number.isSafeInteger(message.date) ? message.date : null
  if (
    date === null ||
    date < options.receiverReadyAtSeconds ||
    options.nowSeconds - date > TELEGRAM_TERMINAL_INPUT_MAX_AGE_SECONDS
  ) {
    return { kind: 'rejected', reason: 'expired', ...identity }
  }

  const body = text.slice(mention.end).trim()
  if (!body || Array.from(body).length > TELEGRAM_TERMINAL_INPUT_MAX_CODE_POINTS) {
    return { kind: 'rejected', reason: 'invalid-input', ...identity }
  }

  return { kind: 'accepted', text: body, ...identity }
}
