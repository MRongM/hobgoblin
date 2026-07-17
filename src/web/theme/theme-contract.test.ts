import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const THEME_ROOT = new URL('./', import.meta.url)
const THEMES_ROOT = new URL('./themes/', import.meta.url)

const CONTRACT_TOKENS = [
  '--color-app-region:',
  '--color-app-region-border:',
  '--color-toolbar:',
  '--color-toolbar-border:',
  '--color-input-background:',
  '--color-input-hover:',
  '--color-input-border:',
  '--color-input-placeholder:',
  '--color-terminal-activity:',
  '--color-terminal-activity-rgb:',
  '--color-terminal-activity-surface:',
  '--color-terminal-activity-border:',
  '--color-terminal-bell:',
  '--color-terminal-bell-rgb:',
  '--color-terminal-bell-surface:',
  '--color-terminal-bell-border:',
  '--color-topbar-muted-foreground:',
  '--color-topbar-control:',
  '--color-topbar-control-hover:',
  '--color-topbar-control-border:',
  '--color-topbar-control-foreground:',
]

const CLASSIC_TERMINAL_TOKENS = [
  '--color-terminal-classic-background:',
  '--color-terminal-classic-foreground:',
  '--color-terminal-classic-cursor:',
  '--color-terminal-classic-selection-background:',
  '--color-terminal-classic-ansi-black:',
  '--color-terminal-classic-ansi-red:',
  '--color-terminal-classic-ansi-green:',
  '--color-terminal-classic-ansi-yellow:',
  '--color-terminal-classic-ansi-blue:',
  '--color-terminal-classic-ansi-magenta:',
  '--color-terminal-classic-ansi-cyan:',
  '--color-terminal-classic-ansi-white:',
  '--color-terminal-classic-ansi-bright-black:',
  '--color-terminal-classic-ansi-bright-red:',
  '--color-terminal-classic-ansi-bright-green:',
  '--color-terminal-classic-ansi-bright-yellow:',
  '--color-terminal-classic-ansi-bright-blue:',
  '--color-terminal-classic-ansi-bright-magenta:',
  '--color-terminal-classic-ansi-bright-cyan:',
  '--color-terminal-classic-ansi-bright-white:',
  '--color-terminal-classic-search-match:',
  '--color-terminal-classic-search-active-match:',
  '--color-terminal-classic-search-active-border:',
]

function readText(url: URL): string {
  return readFileSync(url, 'utf8')
}

function cssRule(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  expect(open, `${selector} opening brace`).toBeGreaterThanOrEqual(0)
  expect(close, `${selector} closing brace`).toBeGreaterThan(open)
  return css.slice(open + 1, close)
}

describe('web theme contract', () => {
  test('exposes semantic tokens for region bars, toolbars, and inputs', () => {
    const contract = readText(new URL('contract.css', THEME_ROOT))

    for (const token of CONTRACT_TOKENS) {
      expect(contract, `missing ${token}`).toContain(token)
    }
  })

  test('scopes topbar control semantics without replacing muted foreground', () => {
    const contract = readText(new URL('contract.css', THEME_ROOT))

    for (const selector of ['.topbar', '.topbar-tone']) {
      const topbar = cssRule(contract, selector)

      expect(topbar).toContain('--color-control: var(--color-topbar-control);')
      expect(topbar).toContain('--color-control-hover: var(--color-topbar-control-hover);')
      expect(topbar).toContain('--color-input: var(--color-topbar-control-border);')
      expect(topbar).toContain('--color-accent: var(--color-topbar-control-hover);')
      expect(topbar).toContain('--color-accent-foreground: var(--color-topbar-control-foreground);')
      expect(topbar).not.toContain('--color-muted-foreground:')
    }
  })

  test('defines classic terminal tokens for every color theme preset', () => {
    const themeFiles = readdirSync(THEMES_ROOT)
      .filter((file) => file.endsWith('.css'))
      .sort()
    expect(themeFiles).not.toEqual([])

    for (const file of themeFiles) {
      const text = readText(new URL(`themes/${file}`, THEME_ROOT))
      for (const token of CLASSIC_TERMINAL_TOKENS) {
        expect(text, `${path.basename(file)} missing ${token}`).toContain(token)
      }
    }
  })
})
