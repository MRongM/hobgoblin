import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorTheme } from '#/shared/color-theme.ts'

const DESIGN_COLOR_THEMES = ['claude', 'cursor', 'apple'] as const

describe('color theme presets', () => {
  test('includes design-derived theme presets after existing presets', () => {
    expect(COLOR_THEMES).toEqual(['macos', 'mono', 'github', 'claude', 'cursor', 'apple'])
    expect(DEFAULT_COLOR_THEME).toBe('macos')
  })

  test('validates design-derived theme presets', () => {
    for (const theme of DESIGN_COLOR_THEMES) {
      expect(isColorTheme(theme)).toBe(true)
    }

    expect(isColorTheme('default')).toBe(false)
    expect(isColorTheme('claude-dark')).toBe(false)
    expect(isColorTheme(null)).toBe(false)
  })
})
