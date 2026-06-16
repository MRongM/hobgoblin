import { describe, expect, test } from 'vitest'
import {
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  defaultSettingsPrefs,
} from '#/shared/settings-defaults.ts'

describe('settings defaults', () => {
  test('defaults file tree font size to 14', () => {
    expect(DEFAULT_FILE_TREE_FONT_SIZE).toBe(14)
    expect(defaultSettingsPrefs().fileTreeFontSize).toBe(14)
    expect(defaultSettingsPrefs()).toMatchObject({ fileTreeTopbarFontSize: 13 })
  })

  test('defaults terminal custom button size to medium', () => {
    expect(DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE).toBe('medium')
    expect((defaultSettingsPrefs() as { terminalCustomButtonSize?: string }).terminalCustomButtonSize).toBe('medium')
  })
})
