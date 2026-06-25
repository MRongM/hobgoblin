// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest'
import {
  installRealTerminalPresetStyles,
  installTerminalThemeStyles,
} from '#/web/components/terminal/terminal-theme-test-utils.ts'
import {
  terminalSearchDecorationsForCurrentDocument,
  terminalThemeForCurrentDocument,
} from '#/web/components/terminal/terminal-theme.ts'

const REQUIRED_XTERM_THEME_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

afterEach(() => {
  document.getElementById('terminal-theme-test-styles')?.remove()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-color-theme')
  document.documentElement.removeAttribute('style')
})

describe('terminal theme tokens', () => {
  test('reads themed terminal tokens by default', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#fbfbfd',
      foreground: '#1d1d1f',
      cursor: '#1d1d1f',
      blue: '#0066cc',
    })
  })

  test('reads classic terminal tokens when sync is disabled', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalThemeForCurrentDocument('classic')).toMatchObject({
      background: '#050505',
      foreground: '#f5f5f5',
      cursor: '#f5f5f5',
      blue: '#5ac8fa',
    })
  })

  test('falls back to themed tokens when a classic token is missing', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.setProperty('--color-terminal-classic-ansi-blue', 'var(--missing-terminal-token)')

    expect(terminalThemeForCurrentDocument('classic')).toMatchObject({
      blue: '#0066cc',
    })
  })

  test('reads matching search decorations for each mode', () => {
    installTerminalThemeStyles()
    document.documentElement.setAttribute('data-theme', 'light')

    expect(terminalSearchDecorationsForCurrentDocument()).toMatchObject({
      matchBackground: '#bf8700',
      activeMatchBackground: '#fb8f44',
      activeMatchBorder: '#1d1d1f',
    })
    expect(terminalSearchDecorationsForCurrentDocument('classic')).toMatchObject({
      matchBackground: '#ffd60a',
      activeMatchBackground: '#ff9f0a',
      activeMatchBorder: '#ffffff',
    })
  })

  test('reads real preset terminal tokens from selected color theme css', () => {
    installRealTerminalPresetStyles('claude')
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-color-theme', 'claude')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#faf9f5',
      foreground: '#141413',
      cursor: '#141413',
      blue: '#496f9f',
    })
  })

  test('reads corrected BMW light terminal tokens from real preset css', () => {
    installRealTerminalPresetStyles('bmw')
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-color-theme', 'bmw')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#ffffff',
      foreground: '#0d0d0d',
      cursor: '#0d0d0d',
      blue: '#1c69d4',
    })
  })

  test('reads dark terminal tokens from real preset css when app theme is dark', () => {
    installRealTerminalPresetStyles('airbnb')
    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.setAttribute('data-color-theme', 'airbnb')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#111111',
      foreground: '#ffffff',
      cursor: '#ffffff',
      blue: '#76a9ff',
    })
  })

  test('reads a contrasting real preset without falling back to classic black', () => {
    installRealTerminalPresetStyles('github')
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-color-theme', 'github')

    expect(terminalThemeForCurrentDocument()).toMatchObject({
      background: '#ffffff',
      foreground: '#1f2328',
      cursor: '#1f2328',
      blue: '#0969da',
    })
  })

  test('returns non-empty values for all required xterm theme fields', () => {
    installRealTerminalPresetStyles('github')
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-color-theme', 'github')

    const theme = terminalThemeForCurrentDocument()
    for (const key of REQUIRED_XTERM_THEME_KEYS) {
      expect(theme[key], key).toEqual(expect.any(String))
      expect(theme[key], key).not.toBe('')
    }
  })

  test('falls back to safe non-empty values when themed tokens are missing', () => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-color-theme')
    document.getElementById('terminal-theme-test-styles')?.remove()

    const theme = terminalThemeForCurrentDocument()
    for (const key of REQUIRED_XTERM_THEME_KEYS) {
      expect(theme[key], key).toEqual(expect.any(String))
      expect(theme[key], key).not.toBe('')
    }
    expect(theme.background).toBe('black')
  })
})
