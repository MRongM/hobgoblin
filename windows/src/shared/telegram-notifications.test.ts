import { describe, expect, test } from 'vitest'
import { normalizeTerminalOutputExcerpt, truncateTerminalOutputExcerpt } from '#/shared/terminal-output-excerpt.ts'

describe('Telegram terminal output', () => {
  test('collapses consecutive spaces, tabs, and line breaks before counting characters', () => {
    expect(truncateTerminalOutputExcerpt('prefix   \t\n beta', 100)).toBe('prefix beta')
    expect(truncateTerminalOutputExcerpt('prefix   \t\n beta 🙂 gamma', 12)).toBe('beta 🙂 gamma')
  })

  test('omits output containing only whitespace', () => {
    expect(normalizeTerminalOutputExcerpt(' \t\r\n  ')).toBeUndefined()
  })

  test('compacts only long box-drawing horizontal rules', () => {
    expect(normalizeTerminalOutputExcerpt('before ─── after --flag')).toBe('before ─── after --flag')
    expect(normalizeTerminalOutputExcerpt(`before ${'─'.repeat(100)} after --flag`)).toBe(
      'before ─── after --flag',
    )
  })

  test('turns Unicode frame edges into boundaries without changing native text', () => {
    expect(normalizeTerminalOutputExcerpt('╭────╮\n│ OpenAI Codex │\n╰────╯ --flag ± plain')).toBe(
      '─── OpenAI Codex ─── --flag ± plain',
    )
  })
})
