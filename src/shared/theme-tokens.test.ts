import { describe, expect, test } from 'vitest'
import { COLOR_THEMES } from '#/shared/color-theme.ts'
import { WINDOW_BACKGROUND_BY_COLOR_THEME } from '#/shared/theme-tokens.ts'

describe('native theme tokens', () => {
  test('defines native window backgrounds for every shared color theme', () => {
    expect(Object.keys(WINDOW_BACKGROUND_BY_COLOR_THEME)).toEqual([...COLOR_THEMES])
  })

  test('does not define removed apple native window backgrounds', () => {
    expect(WINDOW_BACKGROUND_BY_COLOR_THEME).not.toHaveProperty('apple')
  })

  test('defines light and dark native window backgrounds for current presets', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(WINDOW_BACKGROUND_BY_COLOR_THEME[colorTheme]).toMatchObject({
        light: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        dark: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      })
    }
  })
})
