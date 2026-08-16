// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import { APP_FONT_FAMILY_STACKS, applyDocumentFontFamily, fontFamilyStackForPref } from '#/web/font-family.ts'
import * as fontProjection from '#/web/font-family.ts'

afterEach(() => {
  document.documentElement.removeAttribute('data-font-family')
  document.documentElement.removeAttribute('data-app-font-size')
  document.documentElement.style.removeProperty('--font-sans')
  document.documentElement.style.removeProperty('--font-mono')
  document.documentElement.style.removeProperty('--goblin-app-font-size')
  document.documentElement.style.removeProperty('font-size')
})

describe('font family projection', () => {
  test('resolves fixed app UI font stacks for each preference', () => {
    expect(fontFamilyStackForPref('mono')).toBe(APP_FONT_FAMILY_STACKS.mono)
    expect(fontFamilyStackForPref('maple').mono).toContain('Maple Mono NF CN')
    expect(fontFamilyStackForPref('system').sans).toContain('-apple-system')
  })

  test('exposes only app UI font stack fields', () => {
    expect(Object.keys(APP_FONT_FAMILY_STACKS.mono).sort()).toEqual(['mono', 'sans'])
    expect(Object.keys(APP_FONT_FAMILY_STACKS.maple).sort()).toEqual(['mono', 'sans'])
    expect(Object.keys(APP_FONT_FAMILY_STACKS.system).sort()).toEqual(['mono', 'sans'])
  })

  test('applies data attribute and css variables to the document root', () => {
    applyDocumentFontFamily(document, 'system')

    expect(document.documentElement.getAttribute('data-font-family')).toBe('system')
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('-apple-system')
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toContain('ui-monospace')
  })

  test('projects the configured compact UI size onto the document root', () => {
    const projection = fontProjection as typeof fontProjection & {
      applyDocumentFontSize?: (document: Document, fontSize: number) => void
      rootFontSizeForAppFontSize?: (fontSize: number) => number
    }
    expect(projection.applyDocumentFontSize).toBeTypeOf('function')
    expect(projection.rootFontSizeForAppFontSize).toBeTypeOf('function')
    if (!projection.applyDocumentFontSize || !projection.rootFontSizeForAppFontSize) return

    projection.applyDocumentFontSize(document, 14)

    expect(projection.rootFontSizeForAppFontSize(14)).toBe(16)
    expect(document.documentElement.getAttribute('data-app-font-size')).toBe('14')
    expect(document.documentElement.style.getPropertyValue('--goblin-app-font-size')).toBe('14px')
    expect(document.documentElement.style.fontSize).toBe('16px')
  })
})
