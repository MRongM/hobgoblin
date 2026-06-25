import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme, normalizeColorTheme } from '#/shared/color-theme.ts'

const CURRENT_BRAND_THEMES = ['claude', 'cursor', 'airbnb', 'bmw'] as const

describe('color theme presets', () => {
  test('lists current theme presets in settings order', () => {
    expect(COLOR_THEMES).toEqual(['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw'])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates current theme presets only', () => {
    for (const theme of CURRENT_BRAND_THEMES) {
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
    expect(normalizeColorTheme('not-a-theme')).toBe(DEFAULT_COLOR_THEME)
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME)
  })
})
