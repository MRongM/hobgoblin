import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./terminal-session.css', import.meta.url), 'utf8')

describe('terminal session CSS layout contract', () => {
  test('keeps the taller external input matched with terminal bottom padding', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height:')
    expect(css).toContain('padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + 24px);')
    expect(css).toContain('resize: none;')
    expect(css).toContain('.goblin-terminal-external-input__resize')
    expect(css).toContain('top: 4px;')
    expect(css).toContain('right: 4px;')
    expect(css).toContain('min-height: 26px;')
  })

  test('keeps the external input compact before manual resize', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height: 44px;')
    expect(css).toContain('height: 26px;')
  })

  test('centers the external input row and default text line', () => {
    expect(css).toContain('align-items: center;')
    expect(css).toContain('box-sizing: border-box;')
    expect(css).toContain('padding: 4px 0;')
  })
})
