// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import {
  APP_FONT_FAMILY_STACKS,
  applyDocumentFontFamily,
  fontFamilyStackForPref,
} from '#/web/font-family.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-font-family')
  document.documentElement.style.removeProperty('--font-sans')
  document.documentElement.style.removeProperty('--font-mono')
})

describe('font family projection', () => {
  test('resolves fixed font stacks for each preference', () => {
    expect(fontFamilyStackForPref('mono')).toBe(APP_FONT_FAMILY_STACKS.mono)
    expect(fontFamilyStackForPref('maple').terminal).toContain('Maple Mono NF CN')
    expect(fontFamilyStackForPref('system').sans).toContain('-apple-system')
  })

  test('applies data attribute and css variables to the document root', () => {
    applyDocumentFontFamily(document, 'system')

    expect(document.documentElement.getAttribute('data-font-family')).toBe('system')
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('-apple-system')
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toContain('ui-monospace')
  })
})
