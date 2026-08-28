import { describe, expect, test } from 'vitest'
import {
  TELEGRAM_TERMINAL_INPUT_MAX_AGE_SECONDS,
  TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_DEFAULT_SECONDS,
  normalizeTelegramTerminalInputAllowedUserIds,
  parseTelegramTerminalInputUpdate,
} from '#/shared/telegram-terminal-input.ts'

const BASE_NOW_SECONDS = 2_000_000_000

function messageUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 41,
    message: {
      message_id: 7,
      date: BASE_NOW_SECONDS - 1,
      chat: { id: -1001234567890, type: 'supergroup' },
      from: { id: 123456789, is_bot: false },
      text: '@hobgoblin_bot continue',
      entities: [{ type: 'mention', offset: 0, length: 14 }],
      ...overrides,
    },
  }
}

function parse(update: unknown, overrides: Partial<Parameters<typeof parseTelegramTerminalInputUpdate>[1]> = {}) {
  return parseTelegramTerminalInputUpdate(update, {
    botUsername: 'hobgoblin_bot',
    chatId: '-1001234567890',
    allowedUserIds: ['123456789'],
    receiverReadyAtSeconds: BASE_NOW_SECONDS - 10,
    nowSeconds: BASE_NOW_SECONDS,
    ...overrides,
  })
}

describe('Telegram terminal input settings', () => {
  test('normalizes positive decimal user IDs and removes duplicates', () => {
    expect(normalizeTelegramTerminalInputAllowedUserIds([' 123456789 ', 987654321, '123456789', '0', '-1'])).toEqual([
      '123456789',
      '987654321',
    ])
    expect(TELEGRAM_TERMINAL_INPUT_POLL_TIMEOUT_DEFAULT_SECONDS).toBe(25)
  })
})

describe('parseTelegramTerminalInputUpdate', () => {
  test('accepts one fresh single-line submission after the exact leading bot mention', () => {
    expect(parse(messageUpdate())).toEqual({
      kind: 'accepted',
      updateId: 41,
      chatId: '-1001234567890',
      messageId: 7,
      text: 'continue',
    })
  })

  test('uses Telegram UTF-16 entity offsets for a leading mention after spaces', () => {
    expect(
      parse(
        messageUpdate({
          text: '  @Hobgoblin_Bot review 🙂',
          entities: [{ type: 'mention', offset: 2, length: 14 }],
          message_thread_id: 9,
        }),
      ),
    ).toEqual({
      kind: 'accepted',
      updateId: 41,
      chatId: '-1001234567890',
      messageId: 7,
      messageThreadId: 9,
      text: 'review 🙂',
    })
  })

  test('ignores another chat and messages without an exact leading mention', () => {
    expect(parse(messageUpdate({ chat: { id: -1009999999999, type: 'supergroup' } }))).toEqual({ kind: 'ignored' })
    expect(
      parse(
        messageUpdate({
          text: 'please ask @hobgoblin_bot',
          entities: [{ type: 'mention', offset: 11, length: 14 }],
        }),
      ),
    ).toEqual({ kind: 'ignored' })
  })

  test('rejects an addressed message from a sender outside the allowlist', () => {
    expect(parse(messageUpdate({ from: { id: 555555555, is_bot: false } }))).toEqual({
      kind: 'rejected',
      reason: 'unauthorized-sender',
      updateId: 41,
      chatId: '-1001234567890',
      messageId: 7,
    })
  })

  test('rejects startup backlog and messages older than sixty seconds', () => {
    expect(parse(messageUpdate({ date: BASE_NOW_SECONDS - 11 }))).toMatchObject({
      kind: 'rejected',
      reason: 'expired',
    })
    expect(
      parse(messageUpdate({ date: BASE_NOW_SECONDS - TELEGRAM_TERMINAL_INPUT_MAX_AGE_SECONDS - 1 }), {
        receiverReadyAtSeconds: BASE_NOW_SECONDS - 120,
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'expired' })
    expect(
      parse(messageUpdate({ date: BASE_NOW_SECONDS - TELEGRAM_TERMINAL_INPUT_MAX_AGE_SECONDS }), {
        receiverReadyAtSeconds: BASE_NOW_SECONDS - 120,
      }),
    ).toMatchObject({ kind: 'accepted' })
  })

  test.each([
    ['multiline', { text: '@hobgoblin_bot first\nsecond', entities: [{ type: 'mention', offset: 0, length: 14 }] }],
    ['leading newline', { text: '\n@hobgoblin_bot first', entities: [{ type: 'mention', offset: 1, length: 14 }] }],
    ['trailing newline', { text: '@hobgoblin_bot first\n', entities: [{ type: 'mention', offset: 0, length: 14 }] }],
    [
      'control character',
      { text: '@hobgoblin_bot stop\u0003', entities: [{ type: 'mention', offset: 0, length: 14 }] },
    ],
    ['forwarded', { forward_origin: { type: 'user' } }],
    ['anonymous', { sender_chat: { id: -1001234567890 } }],
  ])('rejects addressed %s input', (_label, overrides) => {
    expect(parse(messageUpdate(overrides))).toMatchObject({ kind: 'rejected', reason: 'invalid-input' })
  })

  test('ignores edited messages, media-only updates, bot commands, and replies without a mention', () => {
    expect(parse({ update_id: 41, edited_message: messageUpdate().message })).toEqual({ kind: 'ignored' })
    expect(parse({ update_id: 41, message: { ...messageUpdate().message, text: undefined, photo: [{}] } })).toEqual({
      kind: 'ignored',
    })
    expect(
      parse(
        messageUpdate({
          text: '/run@hobgoblin_bot',
          entities: [{ type: 'bot_command', offset: 0, length: 19 }],
        }),
      ),
    ).toEqual({ kind: 'ignored' })
    expect(parse(messageUpdate({ text: 'continue', entities: [], reply_to_message: { message_id: 1 } }))).toEqual({
      kind: 'ignored',
    })
  })
})
