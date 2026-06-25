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

describe('web theme contract', () => {
  test('exposes semantic tokens for region bars, toolbars, and inputs', () => {
    const contract = readText(new URL('contract.css', THEME_ROOT))

    for (const token of CONTRACT_TOKENS) {
      expect(contract, `missing ${token}`).toContain(token)
    }
  })

  test('defines classic terminal tokens for every color theme preset', () => {
    const themeFiles = readdirSync(THEMES_ROOT).filter((file) => file.endsWith('.css')).sort()
    expect(themeFiles).not.toEqual([])

    for (const file of themeFiles) {
      const text = readText(new URL(`themes/${file}`, THEME_ROOT))
      for (const token of CLASSIC_TERMINAL_TOKENS) {
        expect(text, `${path.basename(file)} missing ${token}`).toContain(token)
      }
    }
  })
})
