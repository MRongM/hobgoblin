import { describe, expect, test } from 'vitest'
import {
  normalizeTelegramOutput,
  truncateTelegramOutputTail,
} from '#/shared/telegram-notifications.ts'

describe('Telegram terminal output', () => {
  test('collapses consecutive spaces, tabs, and line breaks before counting characters', () => {
    expect(truncateTelegramOutputTail('prefix   \t\n beta', 100)).toBe('prefix beta')
    expect(truncateTelegramOutputTail('prefix   \t\n beta 🙂 gamma', 12)).toBe('beta 🙂 gamma')
  })

  test('omits output containing only whitespace', () => {
    expect(normalizeTelegramOutput(' \t\r\n  ')).toBeUndefined()
  })
})
