import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME } from '#/shared/color-theme.ts'

function readBootColorThemes(): string[] {
  const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
  const match = boot.match(/var colorThemes = \[([^\]]+)\]/)
  expect(match, 'boot.js color theme allowlist').not.toBeNull()
  return match![1]!
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

describe('boot color theme allowlist', () => {
  test('stays in sync with shared color themes', () => {
    expect(readBootColorThemes()).toEqual([...COLOR_THEMES])
  })

  test('falls back to the shared default color theme', () => {
    const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
    expect(boot).toContain(`colorTheme = '${DEFAULT_COLOR_THEME}'`)
  })

  test('maps legacy apple query values to macos before validation', () => {
    const boot = readFileSync(new URL('./boot.js', import.meta.url), 'utf8')
    expect(boot).toContain("if (colorTheme === 'apple') colorTheme = 'macos'")
  })
})
