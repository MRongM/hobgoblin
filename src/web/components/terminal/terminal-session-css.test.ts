import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./terminal-session.css', import.meta.url), 'utf8')

describe('terminal session CSS layout contract', () => {
  test('keeps the taller external input matched with terminal bottom padding', () => {
    expect(css).toContain('padding-bottom: 104px;')
    expect(css).toContain('padding-bottom: 66px;')
    expect(css).toContain('min-height: 44px;')
    expect(css).toContain('padding: 8px 12px;')
  })
})
