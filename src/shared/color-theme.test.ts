import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme, normalizeColorTheme } from '#/shared/color-theme.ts'

const CURRENT_BRAND_THEMES = ['claude', 'cursor', 'airbnb', 'bmw'] as const
const ORIGINAL_HOBGOBLIN_THEMES = ['signal', 'forge'] as const
const CLASSIC_THEMES = ['catppuccin', 'solarized', 'tokyo-night'] as const

describe('color theme presets', () => {
  test('lists current theme presets in settings order', () => {
    expect(COLOR_THEMES).toEqual([
      'macos',
      'mono',
      'github',
      'claude',
      'cursor',
      'airbnb',
      'bmw',
      'signal',
      'forge',
      'catppuccin',
      'solarized',
      'tokyo-night',
    ])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates current theme presets only', () => {
    for (const theme of [...CURRENT_BRAND_THEMES, ...ORIGINAL_HOBGOBLIN_THEMES, ...CLASSIC_THEMES]) {
      expect(isColorTheme(theme)).toBe(true)
    }

    expect(isColorTheme('apple')).toBe(false)
    expect(isColorTheme('default')).toBe(false)
    expect(isColorTheme('claude-dark')).toBe(false)
    expect(isColorTheme(null)).toBe(false)
  })

  test('normalizes legacy apple to macos', () => {
    expect(normalizeColorTheme('apple')).toBe('macos')
    expect(normalizeColorTheme('airbnb')).toBe('airbnb')
    expect(normalizeColorTheme('bmw')).toBe('bmw')
    for (const theme of CLASSIC_THEMES) expect(normalizeColorTheme(theme)).toBe(theme)
    expect(normalizeColorTheme('not-a-theme')).toBe(DEFAULT_COLOR_THEME)
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME)
  })
})
