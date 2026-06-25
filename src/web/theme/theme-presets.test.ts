import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES } from '#/shared/color-theme.ts'

const TERMINAL_TOKENS = [
  '--color-terminal-background',
  '--color-terminal-foreground',
  '--color-terminal-cursor',
  '--color-terminal-selection-background',
  '--color-terminal-ansi-black',
  '--color-terminal-ansi-red',
  '--color-terminal-ansi-green',
  '--color-terminal-ansi-yellow',
  '--color-terminal-ansi-blue',
  '--color-terminal-ansi-magenta',
  '--color-terminal-ansi-cyan',
  '--color-terminal-ansi-white',
  '--color-terminal-ansi-bright-black',
  '--color-terminal-ansi-bright-red',
  '--color-terminal-ansi-bright-green',
  '--color-terminal-ansi-bright-yellow',
  '--color-terminal-ansi-bright-blue',
  '--color-terminal-ansi-bright-magenta',
  '--color-terminal-ansi-bright-cyan',
  '--color-terminal-ansi-bright-white',
  '--color-terminal-search-match',
  '--color-terminal-search-active-match',
  '--color-terminal-search-active-border',
] as const

const FOUNDATION_TOKENS = [
  '--goblin-surface-canvas',
  '--goblin-surface-base',
  '--goblin-surface-raised',
  '--goblin-surface-overlay',
  '--goblin-surface-muted',
  '--goblin-surface-hover',
  '--goblin-text-primary',
  '--goblin-text-secondary-strong',
  '--goblin-text-secondary',
  '--goblin-border-subtle',
  '--goblin-border-default',
  '--goblin-border-strong',
  '--goblin-focus-ring',
  '--goblin-action-primary',
  '--goblin-action-primary-foreground',
  '--goblin-action-danger',
  '--goblin-action-danger-foreground',
  '--goblin-accent',
  '--goblin-accent-text',
  '--goblin-accent-rgb',
  '--goblin-status-warning-text',
  '--goblin-status-success-text',
  '--goblin-status-danger-text',
  '--radius',
] as const

function themeCssPath(colorTheme: string): URL {
  return new URL(`./themes/${colorTheme}.css`, import.meta.url)
}

function readThemeCss(colorTheme: string): string {
  return readFileSync(themeCssPath(colorTheme), 'utf8')
}

describe('theme preset css contracts', () => {
  test('has a css file for every shared color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(existsSync(themeCssPath(colorTheme)), `${colorTheme}.css exists`).toBe(true)
    }
  })

  test('defines light and dark selectors for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      expect(css).toContain(`html[data-color-theme='${colorTheme}'][data-theme='light']`)
      expect(css).toContain(`html[data-color-theme='${colorTheme}'][data-theme='dark']`)
    }
  })

  test('defines foundation and terminal tokens for design presets', () => {
    for (const colorTheme of ['claude', 'cursor', 'apple'] as const) {
      const css = readThemeCss(colorTheme)
      for (const token of [...FOUNDATION_TOKENS, ...TERMINAL_TOKENS]) {
        expect(css, `${colorTheme} defines ${token}`).toContain(token)
      }
    }
  })
})
