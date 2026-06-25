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

const CLASSIC_TERMINAL_TOKENS = [
  '--color-terminal-classic-background',
  '--color-terminal-classic-foreground',
  '--color-terminal-classic-cursor',
  '--color-terminal-classic-selection-background',
  '--color-terminal-classic-ansi-black',
  '--color-terminal-classic-ansi-red',
  '--color-terminal-classic-ansi-green',
  '--color-terminal-classic-ansi-yellow',
  '--color-terminal-classic-ansi-blue',
  '--color-terminal-classic-ansi-magenta',
  '--color-terminal-classic-ansi-cyan',
  '--color-terminal-classic-ansi-white',
  '--color-terminal-classic-ansi-bright-black',
  '--color-terminal-classic-ansi-bright-red',
  '--color-terminal-classic-ansi-bright-green',
  '--color-terminal-classic-ansi-bright-yellow',
  '--color-terminal-classic-ansi-bright-blue',
  '--color-terminal-classic-ansi-bright-magenta',
  '--color-terminal-classic-ansi-bright-cyan',
  '--color-terminal-classic-ansi-bright-white',
  '--color-terminal-classic-search-match',
  '--color-terminal-classic-search-active-match',
  '--color-terminal-classic-search-active-border',
] as const

const FOUNDATION_TOKENS = [
  '--goblin-surface-canvas',
  '--goblin-surface-base',
  '--goblin-surface-raised',
  '--goblin-surface-overlay',
  '--goblin-surface-muted',
  '--goblin-surface-hover',
  '--goblin-surface-control',
  '--goblin-surface-control-hover',
  '--goblin-text-primary',
  '--goblin-text-secondary-strong',
  '--goblin-text-secondary',
  '--goblin-text-selected-secondary',
  '--goblin-text-disabled',
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
  '--goblin-accent-selection',
  '--goblin-accent-surface',
  '--goblin-accent-border',
  '--goblin-status-warning-text',
  '--goblin-status-warning-rgb',
  '--goblin-status-warning-surface',
  '--goblin-status-warning-border',
  '--goblin-status-success-text',
  '--goblin-status-success-rgb',
  '--goblin-status-success-surface',
  '--goblin-status-success-border',
  '--goblin-status-danger-text',
  '--goblin-status-danger-rgb',
  '--goblin-status-danger-surface',
  '--goblin-status-danger-border',
  '--color-overlay-scrim',
  '--goblin-shadow-xs',
  '--goblin-shadow-sm',
  '--goblin-shadow-md',
  '--goblin-shadow-lg',
  '--shadow-inset-highlight',
  '--shadow-control-inset-highlight',
  '--radius',
] as const

const APP_REGION_TOKENS = [
  '--goblin-app-bg',
  '--goblin-topbar-bg',
  '--goblin-topbar-border',
  '--goblin-tab-bg',
  '--goblin-tab-hover-bg',
  '--goblin-tab-active-bg',
  '--goblin-sidebar-bg',
  '--goblin-pane-bg',
  '--goblin-pane-header-bg',
  '--goblin-detail-bg',
  '--goblin-card-bg',
  '--goblin-list-row-bg',
  '--goblin-list-row-hover-bg',
  '--goblin-list-row-selected-bg',
  '--goblin-list-row-selected-fg',
  '--goblin-control-bg',
  '--goblin-control-hover-bg',
  '--goblin-control-border',
  '--goblin-control-radius',
  '--goblin-control-height-sm',
  '--goblin-control-density',
  '--goblin-brand-radius-sm',
  '--goblin-brand-radius-md',
  '--goblin-brand-radius-lg',
  '--goblin-brand-divider-strength',
] as const

function themeCssPath(colorTheme: string): URL {
  return new URL(`./themes/${colorTheme}.css`, import.meta.url)
}

function readThemeCss(colorTheme: string): string {
  return readFileSync(themeCssPath(colorTheme), 'utf8')
}

function selectorBlock(css: string, colorTheme: string, theme: 'light' | 'dark'): string {
  const selector = `html[data-color-theme='${colorTheme}'][data-theme='${theme}']`
  const start = css.indexOf(selector)
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  expect(open, `${selector} opening brace`).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return css.slice(open + 1, index)
  }
  throw new Error(`Missing closing brace for ${selector}`)
}

function cssTokenValue(block: string, token: string): string {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`${escapedToken}:\\s*([^;]+);`))
  expect(match, `${token} is defined`).not.toBeNull()
  return match![1]!.trim()
}

function hexLuminance(hex: string): number {
  const match = hex.match(/^#([0-9a-f]{6})$/i)
  expect(match, `expected six-digit hex color, got ${hex}`).not.toBeNull()
  const value = match![1]!
  const red = Number.parseInt(value.slice(0, 2), 16) / 255
  const green = Number.parseInt(value.slice(2, 4), 16) / 255
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

describe('theme preset css contracts', () => {
  test('has a css file for every shared color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(existsSync(themeCssPath(colorTheme)), `${colorTheme}.css exists`).toBe(true)
    }
    expect(existsSync(themeCssPath('apple')), 'apple.css was removed').toBe(false)
  })

  test('defines complete light and dark token blocks for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
          expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(token)
        }
      }
    }
  })

  test('uses distinct light and dark terminal backgrounds for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      const light = selectorBlock(css, colorTheme, 'light')
      const dark = selectorBlock(css, colorTheme, 'dark')
      const lightBackground = cssTokenValue(light, '--color-terminal-background')
      const darkBackground = cssTokenValue(dark, '--color-terminal-background')

      expect(lightBackground, `${colorTheme} terminal light/dark backgrounds differ`).not.toBe(darkBackground)
      expect(hexLuminance(lightBackground), `${colorTheme} light terminal background is light`).toBeGreaterThan(0.72)
      expect(hexLuminance(darkBackground), `${colorTheme} dark terminal background is dark`).toBeLessThan(0.28)
    }
  })

  test('defines complete classic terminal token coverage for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      for (const token of CLASSIC_TERMINAL_TOKENS) {
        expect(css, `${colorTheme} defines ${token}`).toContain(`${token}:`)
      }
    }
  })

  test('keeps macos aligned with the Apple-style preset role', () => {
    const css = readThemeCss('macos')
    const light = selectorBlock(css, 'macos', 'light')
    const dark = selectorBlock(css, 'macos', 'dark')

    expect(light).toContain('--goblin-surface-canvas: #ffffff;')
    expect(light).toContain('--goblin-action-primary: #0066cc;')
    expect(light).toContain('--color-terminal-background: #fbfbfd;')
    expect(dark).toContain('--goblin-surface-canvas: #000000;')
    expect(dark).toContain('--goblin-action-primary: #2997ff;')
  })

  test('keeps cursor aligned with the Cursor design brief', () => {
    const light = selectorBlock(readThemeCss('cursor'), 'cursor', 'light')

    expect(light).toContain('--goblin-surface-canvas: #f7f7f4;')
    expect(light).toContain('--goblin-text-primary: #26251e;')
    expect(light).toContain('--goblin-action-primary: #f54e00;')
    expect(light).toContain('--goblin-shadow-md: 0 1px 2px rgb(38 37 30 / 0.04);')
    expect(light).toContain('--goblin-shadow-lg: 0 1px 3px rgb(38 37 30 / 0.06);')
    expect(light).toContain('--color-terminal-background: #fafaf7;')
  })

  test('keeps new brand presets aligned with their source design briefs', () => {
    const airbnbLight = selectorBlock(readThemeCss('airbnb'), 'airbnb', 'light')
    const bmwDark = selectorBlock(readThemeCss('bmw'), 'bmw', 'dark')

    expect(airbnbLight).toContain('--goblin-surface-canvas: #ffffff;')
    expect(airbnbLight).toContain('--goblin-action-primary: #ff385c;')
    expect(airbnbLight).toContain('--goblin-control-radius: 1.25rem;')

    expect(bmwDark).toContain('--goblin-surface-canvas: #000000;')
    expect(bmwDark).toContain('--goblin-action-primary: #ffffff;')
    expect(bmwDark).toContain('--goblin-control-radius: 0rem;')
  })
})
