import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { COLOR_THEMES, type ColorTheme } from '#/shared/color-theme.ts'
import { TOPBAR_BACKGROUND_BY_COLOR_THEME } from '#/shared/theme-tokens.ts'

const THEME_MODES = ['light', 'dark'] as const
type ThemeMode = (typeof THEME_MODES)[number]
type Rgb = readonly [number, number, number]

const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const

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
  '--goblin-toolbar-bg',
  '--goblin-toolbar-border',
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

const TERMINAL_ACTIVITY_TOKENS = [
  '--goblin-terminal-activity',
  '--goblin-terminal-activity-rgb',
  '--goblin-terminal-activity-surface',
  '--goblin-terminal-activity-border',
] as const

const TERMINAL_BELL_TOKENS = [
  '--goblin-terminal-bell',
  '--goblin-terminal-bell-rgb',
  '--goblin-terminal-bell-surface',
  '--goblin-terminal-bell-border',
] as const

const BELL_COLOR_EXPECTATIONS = {
  macos: {
    light: { hex: '#af52de', rgb: '175 82 222' },
    dark: { hex: '#da8fff', rgb: '218 143 255' },
  },
  mono: {
    light: { hex: '#0e7490', rgb: '14 116 144' },
    dark: { hex: '#22d3ee', rgb: '34 211 238' },
  },
  github: {
    light: { hex: '#1f883d', rgb: '31 136 61' },
    dark: { hex: '#3fb950', rgb: '63 185 80' },
  },
  claude: {
    light: { hex: '#496f9f', rgb: '73 111 159' },
    dark: { hex: '#8bb8f0', rgb: '139 184 240' },
  },
  cursor: {
    light: { hex: '#7c4ab0', rgb: '124 74 176' },
    dark: { hex: '#c59be8', rgb: '197 155 232' },
  },
  airbnb: {
    light: { hex: '#007a87', rgb: '0 122 135' },
    dark: { hex: '#4bb7c5', rgb: '75 183 197' },
  },
  bmw: {
    light: { hex: '#c42116', rgb: '196 33 22' },
    dark: { hex: '#ff5a4d', rgb: '255 90 77' },
  },
  signal: {
    light: { hex: '#8a6400', rgb: '138 100 0' },
    dark: { hex: '#f0b84a', rgb: '240 184 74' },
  },
  forge: {
    light: { hex: '#1f7a55', rgb: '31 122 85' },
    dark: { hex: '#79c79a', rgb: '121 199 154' },
  },
  catppuccin: {
    light: { hex: '#9a6500', rgb: '154 101 0' },
    dark: { hex: '#f9e2af', rgb: '249 226 175' },
  },
  solarized: {
    light: { hex: '#806000', rgb: '128 96 0' },
    dark: { hex: '#d6b84a', rgb: '214 184 74' },
  },
  'tokyo-night': {
    light: { hex: '#8f5e15', rgb: '143 94 21' },
    dark: { hex: '#e0af68', rgb: '224 175 104' },
  },
} as const satisfies Record<ColorTheme, Record<ThemeMode, { hex: string; rgb: string }>>

const BELL_DIRECT_SURFACES = [
  { label: 'inactive repo tab', token: '--goblin-topbar-bg' },
  { label: 'inactive terminal tab and toolbar branch summary', token: '--goblin-toolbar-bg' },
  { label: 'hovered repo or terminal tab', token: '--goblin-tab-hover-bg' },
  { label: 'active or dragging repo or terminal tab', token: '--goblin-tab-active-bg' },
  { label: 'branch row', token: '--goblin-sidebar-bg' },
  { label: 'hovered branch row', token: '--goblin-list-row-hover-bg' },
  { label: 'dragging branch row', token: '--goblin-card-bg' },
  { label: 'terminal dropdown', token: '--goblin-surface-overlay' },
  { label: 'focused terminal dropdown item', token: '--goblin-surface-hover' },
  { label: 'pane fallback', token: '--goblin-pane-bg' },
  { label: 'pane header fallback', token: '--goblin-pane-header-bg' },
] as const

const BELL_COMPOSITE_SURFACES = [
  {
    label: 'selected branch row',
    foregroundToken: '--goblin-list-row-selected-bg',
    backgroundToken: '--goblin-sidebar-bg',
  },
  {
    label: 'selected terminal dropdown item',
    foregroundToken: '--goblin-accent-selection',
    backgroundToken: '--goblin-surface-overlay',
  },
] as const

const TOPBAR_BRAND_TINT_EXPECTATIONS = {
  macos: {
    light: {
      topbar: '#d8e7f8',
      border: '#bfd0e4',
      toolbar: '#e4effc',
      tabHover: '#fafafc',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#0d1622',
      border: '#243247',
      toolbar: '#1f3044',
      tabHover: '#1d1d1f',
      tabActive: '#272729',
    },
  },
  mono: {
    light: {
      topbar: '#d6d6d8',
      border: '#c6c6ca',
      toolbar: '#e3e3e5',
      tabHover: '#f7f7f8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#151518',
      border: '#2a2a2e',
      toolbar: '#303033',
      tabHover: '#1d1d20',
      tabActive: '#27272a',
    },
  },
  github: {
    light: {
      topbar: '#f6f8fa',
      border: '#d0d7de',
      toolbar: '#ffffff',
      tabHover: '#f6f8fa',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#161b22',
      border: '#30363d',
      toolbar: '#161b22',
      tabHover: '#161b22',
      tabActive: '#21262d',
    },
  },
  claude: {
    light: {
      topbar: '#ead7c9',
      border: '#d6bdad',
      toolbar: '#f1e2d6',
      tabHover: '#f5f0e8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#211a17',
      border: '#4a3329',
      toolbar: '#372b24',
      tabHover: '#25201d',
      tabActive: '#2e2823',
    },
  },
  cursor: {
    light: {
      topbar: '#f1f1ef',
      border: '#d8d8d4',
      toolbar: '#f7f7f5',
      tabHover: '#f5f5f3',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#1d1d1d',
      border: '#343434',
      toolbar: '#242424',
      tabHover: '#292929',
      tabActive: '#303030',
    },
  },
  airbnb: {
    light: {
      topbar: '#f8d7df',
      border: '#eab8c3',
      toolbar: '#fde7eb',
      tabHover: '#fff7f8',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#2a151a',
      border: '#59313a',
      toolbar: '#43262d',
      tabHover: '#2f2024',
      tabActive: '#37282c',
    },
  },
  bmw: {
    light: {
      topbar: '#d7e3f2',
      border: '#a9b8cc',
      toolbar: '#e6f0fb',
      tabHover: '#f5f5f5',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#050b14',
      border: '#2a3d56',
      toolbar: '#0f1a29',
      tabHover: '#121a25',
      tabActive: '#1f2a38',
    },
  },
  signal: {
    light: {
      topbar: '#c8e4df',
      border: '#95c7bf',
      toolbar: '#ddf0ec',
      tabHover: '#f1f8f6',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#102522',
      border: '#2a5a53',
      toolbar: '#1b3934',
      tabHover: '#182d2a',
      tabActive: '#203c38',
    },
  },
  forge: {
    light: {
      topbar: '#ded0ba',
      border: '#c4ad8d',
      toolbar: '#eadfcd',
      tabHover: '#f4eee3',
      tabActive: '#fffdf8',
    },
    dark: {
      topbar: '#211813',
      border: '#63442d',
      toolbar: '#37261b',
      tabHover: '#2b2019',
      tabActive: '#3a2a20',
    },
  },
  catppuccin: {
    light: {
      topbar: '#dce0e8',
      border: '#bcc0cc',
      toolbar: '#e6e9ef',
      tabHover: '#eff1f5',
      tabActive: '#ffffff',
    },
    dark: {
      topbar: '#11111b',
      border: '#45475a',
      toolbar: '#181825',
      tabHover: '#313244',
      tabActive: '#45475a',
    },
  },
  solarized: {
    light: {
      topbar: '#ded7c3',
      border: '#c7bea8',
      toolbar: '#eee8d5',
      tabHover: '#f5efdd',
      tabActive: '#fdf6e3',
    },
    dark: {
      topbar: '#001f27',
      border: '#31515a',
      toolbar: '#073642',
      tabHover: '#0b414d',
      tabActive: '#12505d',
    },
  },
  'tokyo-night': {
    light: {
      topbar: '#c7cbda',
      border: '#adb2c4',
      toolbar: '#d8dae4',
      tabHover: '#dfe1e8',
      tabActive: '#e6e7ed',
    },
    dark: {
      topbar: '#16161e',
      border: '#414868',
      toolbar: '#24283b',
      tabHover: '#2d324a',
      tabActive: '#343b58',
    },
  },
} as const

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

function parseHexRgb(value: string): Rgb {
  const match = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) throw new Error(`Expected six-digit hex color, got ${value}`)
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ]
}

function parseRgbTriplet(value: string): Rgb {
  const match = value.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/)
  if (!match) throw new Error(`Expected space-separated RGB triplet, got ${value}`)
  const rgb = [Number(match[1]), Number(match[2]), Number(match[3])] as const
  if (rgb.some((channel) => channel < 0 || channel > 255)) {
    throw new Error(`RGB channel out of range in ${value}`)
  }
  return rgb
}

function parseAlphaTokenColor(block: string, token: string): { rgb: Rgb; alpha: number } {
  const value = cssTokenValue(block, token)
  const match = value.match(/^rgb\(var\((--[a-z0-9-]+)\)\s*\/\s*(0(?:\.\d+)?|1(?:\.0+)?)\)$/i)
  if (!match) throw new Error(`Expected rgb(var(--token) / alpha), got ${token}: ${value}`)

  return {
    rgb: parseRgbTriplet(cssTokenValue(block, match[1]!)),
    alpha: Number(match[2]),
  }
}

function linearRgbChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * linearRgbChannel(rgb[0]) +
    0.7152 * linearRgbChannel(rgb[1]) +
    0.0722 * linearRgbChannel(rgb[2])
  )
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function compositeRgb(foreground: { rgb: Rgb; alpha: number }, background: Rgb): Rgb {
  const inverseAlpha = 1 - foreground.alpha
  return [
    foreground.rgb[0] * foreground.alpha + background[0] * inverseAlpha,
    foreground.rgb[1] * foreground.alpha + background[1] * inverseAlpha,
    foreground.rgb[2] * foreground.alpha + background[2] * inverseAlpha,
  ]
}

function bellContrastSurfaces(block: string): ReadonlyArray<{ label: string; rgb: Rgb }> {
  const direct = BELL_DIRECT_SURFACES.map(({ label, token }) => ({
    label,
    rgb: parseHexRgb(cssTokenValue(block, token)),
  }))

  const composite = BELL_COMPOSITE_SURFACES.map(({ label, foregroundToken, backgroundToken }) => ({
    label,
    rgb: compositeRgb(
      parseAlphaTokenColor(block, foregroundToken),
      parseHexRgb(cssTokenValue(block, backgroundToken)),
    ),
  }))

  return [...direct, ...composite]
}

function expectContrastAtLeast(
  block: string,
  foregroundToken: string,
  backgroundToken: string,
  minimum = 4.5,
): void {
  expect(
    contrastRatio(
      parseHexRgb(cssTokenValue(block, foregroundToken)),
      parseHexRgb(cssTokenValue(block, backgroundToken)),
    ),
    `${foregroundToken} against ${backgroundToken}`,
  ).toBeGreaterThanOrEqual(minimum)
}

function expectCompletePreset(colorTheme: string): void {
  const css = readThemeCss(colorTheme)
  for (const mode of THEME_MODES) {
    const block = selectorBlock(css, colorTheme, mode)
    for (const token of [...FOUNDATION_TOKENS, ...APP_REGION_TOKENS, ...TERMINAL_TOKENS]) {
      expect(block, `${colorTheme}/${mode} defines ${token}`).toContain(token)
    }
  }
  for (const token of CLASSIC_TERMINAL_TOKENS) {
    expect(css, `${colorTheme} defines ${token}`).toContain(`${token}:`)
  }
}

function expectTokenValues(block: string, expected: Readonly<Record<string, string>>): void {
  for (const [token, value] of Object.entries(expected)) {
    expect(cssTokenValue(block, token), token).toBe(value)
  }
}

function expectAnsiValues(
  block: string,
  standard: readonly string[],
  bright: readonly string[],
): void {
  ANSI_NAMES.forEach((name, index) => {
    expect(cssTokenValue(block, `--color-terminal-ansi-${name}`)).toBe(standard[index])
    expect(cssTokenValue(block, `--color-terminal-ansi-bright-${name}`)).toBe(bright[index])
  })
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

  test('defines explicit terminal activity tokens for original Hobgoblin themes', () => {
    for (const colorTheme of ['signal', 'forge'] as const) {
      const css = readThemeCss(colorTheme)
      for (const theme of THEME_MODES) {
        const block = selectorBlock(css, colorTheme, theme)
        for (const token of TERMINAL_ACTIVITY_TOKENS) {
          expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(`${token}:`)
        }
      }
    }
  })

  test('defines the approved unread bell token family for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      for (const theme of THEME_MODES) {
        const block = selectorBlock(css, colorTheme, theme)
        const expected = BELL_COLOR_EXPECTATIONS[colorTheme][theme]
        const expectedSurfaceAlpha = theme === 'light' ? '0.13' : '0.14'

        for (const token of TERMINAL_BELL_TOKENS) {
          expect(block, `${colorTheme}/${theme} defines ${token}`).toContain(`${token}:`)
        }

        const bellHex = cssTokenValue(block, '--goblin-terminal-bell')
        const bellRgb = cssTokenValue(block, '--goblin-terminal-bell-rgb')
        expect(bellHex, `${colorTheme}/${theme} bell hex`).toBe(expected.hex)
        expect(bellRgb, `${colorTheme}/${theme} bell rgb`).toBe(expected.rgb)
        expect(parseRgbTriplet(bellRgb), `${colorTheme}/${theme} hex and rgb agree`).toEqual(parseHexRgb(bellHex))
        expect(cssTokenValue(block, '--goblin-terminal-bell-surface')).toBe(
          `rgb(var(--goblin-terminal-bell-rgb) / ${expectedSurfaceAlpha})`,
        )
        expect(cssTokenValue(block, '--goblin-terminal-bell-border')).toBe(
          'rgb(var(--goblin-terminal-bell-rgb) / 0.38)',
        )
      }
    }
  })

  test('keeps the unread bell core at 3:1 contrast on every host surface', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      for (const theme of THEME_MODES) {
        const block = selectorBlock(css, colorTheme, theme)
        const bell = parseHexRgb(cssTokenValue(block, '--goblin-terminal-bell'))
        const surfaces = bellContrastSurfaces(block)

        expect(surfaces, `${colorTheme}/${theme} resolves every host surface`).toHaveLength(
          BELL_DIRECT_SURFACES.length + BELL_COMPOSITE_SURFACES.length,
        )

        for (const surface of surfaces) {
          expect(
            contrastRatio(bell, surface.rgb),
            `${colorTheme}/${theme} bell contrasts with ${surface.label}`,
          ).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  test('keeps topbar visually deeper than tab states for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)

      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        const topbar = hexLuminance(cssTokenValue(block, '--goblin-topbar-bg'))
        const tabHover = hexLuminance(cssTokenValue(block, '--goblin-tab-hover-bg'))
        const tabActive = hexLuminance(cssTokenValue(block, '--goblin-tab-active-bg'))

        if (colorTheme === 'github') {
          expect(topbar, `${colorTheme}/${theme} topbar is not brighter than tab hover`).toBeLessThanOrEqual(tabHover)
          expect(cssTokenValue(block, '--goblin-topbar-border')).not.toBe(
            cssTokenValue(block, '--goblin-topbar-bg'),
          )
        } else {
          expect(topbar, `${colorTheme}/${theme} topbar is deeper than tab hover`).toBeLessThan(tabHover)
        }
        expect(tabHover, `${colorTheme}/${theme} tab hover is not brighter than active tab`).toBeLessThanOrEqual(
          tabActive,
        )
      }
    }
  })

  test('keeps topbar visually deeper than toolbar for every color theme', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)

      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        const topbar = hexLuminance(cssTokenValue(block, '--goblin-topbar-bg'))
        const toolbar = hexLuminance(cssTokenValue(block, '--goblin-toolbar-bg'))

        if (colorTheme === 'github') {
          expect(topbar, `${colorTheme}/${theme} topbar is not brighter than toolbar`).toBeLessThanOrEqual(toolbar)
        } else {
          expect(topbar, `${colorTheme}/${theme} topbar is deeper than toolbar`).toBeLessThan(toolbar)
        }
      }
    }
  })

  test('keeps native title bar overlays aligned with renderer topbars', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)

      for (const theme of THEME_MODES) {
        const block = selectorBlock(css, colorTheme, theme)

        expect(TOPBAR_BACKGROUND_BY_COLOR_THEME[colorTheme][theme], `${colorTheme}/${theme} native topbar`).toBe(
          cssTokenValue(block, '--goblin-topbar-bg'),
        )
      }
    }
  })

  test('uses the approved theme-native topbar brand tint pairings', () => {
    for (const colorTheme of COLOR_THEMES) {
      const css = readThemeCss(colorTheme)
      const expectedByTheme = TOPBAR_BRAND_TINT_EXPECTATIONS[colorTheme]

      for (const theme of ['light', 'dark'] as const) {
        const block = selectorBlock(css, colorTheme, theme)
        const expected = expectedByTheme[theme]

        expect(cssTokenValue(block, '--goblin-topbar-bg'), `${colorTheme}/${theme} topbar`).toBe(expected.topbar)
        expect(cssTokenValue(block, '--goblin-topbar-border'), `${colorTheme}/${theme} topbar border`).toBe(
          expected.border,
        )
        expect(cssTokenValue(block, '--goblin-toolbar-bg'), `${colorTheme}/${theme} toolbar`).toBe(expected.toolbar)
        expect(cssTokenValue(block, '--goblin-tab-hover-bg'), `${colorTheme}/${theme} tab hover`).toBe(
          expected.tabHover,
        )
        expect(cssTokenValue(block, '--goblin-tab-active-bg'), `${colorTheme}/${theme} tab active`).toBe(
          expected.tabActive,
        )
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

  test('uses the approved GitHub Enterprise Graphite chrome palette', () => {
    const css = readThemeCss('github')
    const light = selectorBlock(css, 'github', 'light')
    const dark = selectorBlock(css, 'github', 'dark')

    expect(cssTokenValue(light, '--goblin-topbar-bg')).toBe('#f6f8fa')
    expect(cssTokenValue(light, '--goblin-topbar-fg')).toBe('#1f2328')
    expect(cssTokenValue(light, '--goblin-topbar-muted-fg')).toBe('#59636e')
    expect(cssTokenValue(light, '--goblin-topbar-control-bg')).toBe('#ffffff')
    expect(cssTokenValue(light, '--goblin-topbar-control-hover-bg')).toBe('#f3f4f6')
    expect(cssTokenValue(light, '--goblin-topbar-control-border')).toBe('#afb8c1')
    expect(cssTokenValue(light, '--goblin-topbar-control-fg')).toBe('#1f2328')
    expect(cssTokenValue(light, '--goblin-toolbar-bg')).toBe('#ffffff')
    expect(cssTokenValue(light, '--goblin-toolbar-border')).toBe('#d0d7de')
    expect(cssTokenValue(light, '--goblin-action-primary')).toBe('#1f883d')
    expect(cssTokenValue(light, '--goblin-accent')).toBe('#1a7f37')
    expect(cssTokenValue(light, '--goblin-terminal-bell')).toBe('#1f883d')

    expect(cssTokenValue(dark, '--goblin-topbar-bg')).toBe('#161b22')
    expect(cssTokenValue(dark, '--goblin-topbar-fg')).toBe('#e6edf3')
    expect(cssTokenValue(dark, '--goblin-topbar-muted-fg')).toBe('#8b949e')
    expect(cssTokenValue(dark, '--goblin-topbar-control-bg')).toBe('#21262d')
    expect(cssTokenValue(dark, '--goblin-topbar-control-hover-bg')).toBe('#30363d')
    expect(cssTokenValue(dark, '--goblin-topbar-control-border')).toBe('#484f58')
    expect(cssTokenValue(dark, '--goblin-topbar-control-fg')).toBe('#e6edf3')
    expect(cssTokenValue(dark, '--goblin-toolbar-bg')).toBe('#161b22')
    expect(cssTokenValue(dark, '--goblin-toolbar-border')).toBe('#30363d')
    expect(cssTokenValue(dark, '--goblin-action-primary')).toBe('#238636')
    expect(cssTokenValue(dark, '--goblin-accent')).toBe('#3fb950')
  })

  test('keeps GitHub critical text pairs at 4.5 to 1', () => {
    const css = readThemeCss('github')
    for (const mode of THEME_MODES) {
      const block = selectorBlock(css, 'github', mode)
      expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
      expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-bg')
      expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-hover-bg')
      expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
      expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
    }
  })

  test('keeps GitHub light chrome visibly separated from macOS', () => {
    const github = selectorBlock(readThemeCss('github'), 'github', 'light')
    const macos = selectorBlock(readThemeCss('macos'), 'macos', 'light')

    // GitHub uses neutral Primer chrome while macOS retains its blue-tinted chrome.
    expect(cssTokenValue(github, '--goblin-topbar-bg')).toBe('#f6f8fa')
    expect(cssTokenValue(macos, '--goblin-topbar-bg')).not.toBe('#f6f8fa')

    // GitHub uses green accent; macOS uses blue accent
    expect(cssTokenValue(github, '--goblin-accent')).toBe('#1a7f37')
    expect(cssTokenValue(macos, '--goblin-accent')).not.toBe('#1a7f37')

    // Primary action colors remain distinct
    expect(cssTokenValue(github, '--goblin-action-primary')).toBe('#1f883d')
    expect(cssTokenValue(macos, '--goblin-action-primary')).toBe('#0066cc')
  })

  test('keeps Catppuccin aligned with Latte and Mocha', () => {
    expect(existsSync(themeCssPath('catppuccin')), 'catppuccin.css exists').toBe(true)
    expectCompletePreset('catppuccin')

    const css = readThemeCss('catppuccin')
    const light = selectorBlock(css, 'catppuccin', 'light')
    const dark = selectorBlock(css, 'catppuccin', 'dark')

    expectTokenValues(light, {
      '--goblin-surface-canvas': '#eff1f5',
      '--goblin-surface-base': '#e6e9ef',
      '--goblin-surface-raised': '#ffffff',
      '--goblin-surface-overlay': '#ffffff',
      '--goblin-surface-hover': '#dce0e8',
      '--goblin-text-primary': '#4c4f69',
      '--goblin-text-secondary': '#5c5f77',
      '--goblin-border-default': '#bcc0cc',
      '--goblin-border-strong': '#9ca0b0',
      '--goblin-focus-ring': '#8839ef',
      '--goblin-action-primary': '#8839ef',
      '--goblin-action-primary-foreground': '#ffffff',
      '--goblin-accent': '#8839ef',
      '--goblin-accent-text': '#8839ef',
      '--goblin-accent-rgb': '136 57 239',
      '--goblin-terminal-bell': '#9a6500',
      '--goblin-terminal-bell-rgb': '154 101 0',
      '--color-overlay-scrim': 'rgb(76 79 105 / 0.38)',
      '--goblin-shadow-xs': '0 1px 1px rgb(76 79 105 / 0.04)',
      '--goblin-shadow-sm': '0 1px 2px rgb(76 79 105 / 0.06)',
      '--goblin-shadow-md': '0 8px 24px rgb(76 79 105 / 0.12)',
      '--goblin-shadow-lg': '0 18px 48px rgb(76 79 105 / 0.16)',
      '--radius': '0.625rem',
      '--goblin-topbar-bg': '#dce0e8',
      '--goblin-topbar-border': '#bcc0cc',
      '--goblin-topbar-fg': '#4c4f69',
      '--goblin-topbar-muted-fg': '#5c5f77',
      '--goblin-toolbar-bg': '#e6e9ef',
      '--goblin-toolbar-border': '#bcc0cc',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#eff1f5',
      '--goblin-tab-active-bg': '#ffffff',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.14)',
      '--goblin-list-row-selected-fg': '#4c4f69',
      '--goblin-control-radius': '0.625rem',
      '--goblin-brand-radius-sm': '0.375rem',
      '--goblin-brand-radius-md': '0.625rem',
      '--goblin-brand-radius-lg': '0.875rem',
      '--color-terminal-background': '#eff1f5',
      '--color-terminal-foreground': '#4c4f69',
      '--color-terminal-cursor': '#4c4f69',
      '--color-terminal-selection-background': 'rgb(136 57 239 / 0.24)',
      '--color-terminal-search-match': '#df8e1d',
      '--color-terminal-search-active-match': '#8839ef',
      '--color-terminal-search-active-border': '#4c4f69',
    })

    expectTokenValues(dark, {
      '--goblin-surface-canvas': '#1e1e2e',
      '--goblin-surface-base': '#181825',
      '--goblin-surface-raised': '#313244',
      '--goblin-surface-overlay': '#45475a',
      '--goblin-surface-hover': '#45475a',
      '--goblin-text-primary': '#cdd6f4',
      '--goblin-text-secondary': '#a6adc8',
      '--goblin-border-default': '#45475a',
      '--goblin-border-strong': '#585b70',
      '--goblin-focus-ring': '#cba6f7',
      '--goblin-action-primary': '#cba6f7',
      '--goblin-action-primary-foreground': '#11111b',
      '--goblin-accent': '#cba6f7',
      '--goblin-accent-text': '#cba6f7',
      '--goblin-accent-rgb': '203 166 247',
      '--goblin-terminal-bell': '#f9e2af',
      '--goblin-terminal-bell-rgb': '249 226 175',
      '--color-overlay-scrim': 'rgb(17 17 27 / 0.58)',
      '--goblin-shadow-xs': '0 1px 1px rgb(17 17 27 / 0.28)',
      '--goblin-shadow-sm': '0 1px 2px rgb(17 17 27 / 0.34)',
      '--goblin-shadow-md': '0 8px 24px rgb(17 17 27 / 0.44)',
      '--goblin-shadow-lg': '0 18px 48px rgb(17 17 27 / 0.52)',
      '--radius': '0.625rem',
      '--goblin-topbar-bg': '#11111b',
      '--goblin-topbar-border': '#45475a',
      '--goblin-topbar-fg': '#cdd6f4',
      '--goblin-topbar-muted-fg': '#a6adc8',
      '--goblin-toolbar-bg': '#181825',
      '--goblin-toolbar-border': '#45475a',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#313244',
      '--goblin-tab-active-bg': '#45475a',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.22)',
      '--goblin-list-row-selected-fg': '#cdd6f4',
      '--goblin-control-radius': '0.625rem',
      '--goblin-brand-radius-sm': '0.375rem',
      '--goblin-brand-radius-md': '0.625rem',
      '--goblin-brand-radius-lg': '0.875rem',
      '--color-terminal-background': '#1e1e2e',
      '--color-terminal-foreground': '#cdd6f4',
      '--color-terminal-cursor': '#cdd6f4',
      '--color-terminal-selection-background': 'rgb(203 166 247 / 0.28)',
      '--color-terminal-search-match': '#f9e2af',
      '--color-terminal-search-active-match': '#cba6f7',
      '--color-terminal-search-active-border': '#cdd6f4',
    })

    expectAnsiValues(
      light,
      ['#4c4f69', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#8839ef', '#179299', '#8c8fa1'],
      ['#6c6f85', '#e64553', '#40a02b', '#fe640b', '#209fb5', '#ea76cb', '#04a5e5', '#4c4f69'],
    )
    expectAnsiValues(
      dark,
      ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#cba6f7', '#94e2d5', '#bac2de'],
      ['#6c7086', '#eba0ac', '#a6e3a1', '#fab387', '#74c7ec', '#f5c2e7', '#89dceb', '#cdd6f4'],
    )

    for (const [mode, block] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const bell = parseHexRgb(cssTokenValue(block, '--goblin-terminal-bell'))
      for (const surface of bellContrastSurfaces(block)) {
        expect(contrastRatio(bell, surface.rgb), `catppuccin/${mode} bell against ${surface.label}`)
          .toBeGreaterThanOrEqual(3)
      }
      expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
      expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control-hover')
      expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
      expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
    }
  })

  test('keeps Solarized aligned with its Light and Dark palette', () => {
    expect(existsSync(themeCssPath('solarized')), 'solarized.css exists').toBe(true)
    expectCompletePreset('solarized')

    const css = readThemeCss('solarized')
    const light = selectorBlock(css, 'solarized', 'light')
    const dark = selectorBlock(css, 'solarized', 'dark')

    expectTokenValues(light, {
      '--goblin-surface-canvas': '#fdf6e3',
      '--goblin-surface-base': '#eee8d5',
      '--goblin-surface-raised': '#fffdf5',
      '--goblin-surface-overlay': '#fffdf5',
      '--goblin-surface-control': '#fffdf5',
      '--goblin-surface-control-hover': '#f5efdd',
      '--goblin-text-primary': '#475b62',
      '--goblin-text-secondary-strong': '#4b6168',
      '--goblin-text-secondary': '#566c73',
      '--goblin-border-default': '#d8cfb9',
      '--goblin-border-strong': '#c7bea8',
      '--goblin-focus-ring': '#268bd2',
      '--goblin-action-primary': '#1f6f9f',
      '--goblin-action-primary-foreground': '#ffffff',
      '--goblin-accent': '#268bd2',
      '--goblin-accent-text': '#1f6f9f',
      '--goblin-accent-rgb': '38 139 210',
      '--goblin-terminal-bell': '#806000',
      '--goblin-terminal-bell-rgb': '128 96 0',
      '--color-overlay-scrim': 'rgb(0 43 54 / 0.32)',
      '--goblin-shadow-xs': '0 1px 1px rgb(0 43 54 / 0.03)',
      '--goblin-shadow-sm': '0 1px 2px rgb(0 43 54 / 0.05)',
      '--goblin-shadow-md': '0 6px 18px rgb(0 43 54 / 0.08)',
      '--goblin-shadow-lg': '0 14px 36px rgb(0 43 54 / 0.12)',
      '--radius': '0.25rem',
      '--goblin-topbar-bg': '#ded7c3',
      '--goblin-topbar-border': '#c7bea8',
      '--goblin-topbar-fg': '#475b62',
      '--goblin-topbar-muted-fg': '#4b6168',
      '--goblin-toolbar-bg': '#eee8d5',
      '--goblin-toolbar-border': '#d8cfb9',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#f5efdd',
      '--goblin-tab-active-bg': '#fdf6e3',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.14)',
      '--goblin-list-row-selected-fg': '#475b62',
      '--goblin-control-radius': '0.25rem',
      '--goblin-brand-radius-sm': '0.125rem',
      '--goblin-brand-radius-md': '0.25rem',
      '--goblin-brand-radius-lg': '0.375rem',
      '--color-terminal-background': '#fdf6e3',
      '--color-terminal-foreground': '#475b62',
      '--color-terminal-cursor': '#475b62',
      '--color-terminal-selection-background': 'rgb(38 139 210 / 0.22)',
      '--color-terminal-search-match': '#b58900',
      '--color-terminal-search-active-match': '#268bd2',
      '--color-terminal-search-active-border': '#475b62',
    })

    expectTokenValues(dark, {
      '--goblin-surface-canvas': '#002b36',
      '--goblin-surface-base': '#073642',
      '--goblin-surface-raised': '#0b414d',
      '--goblin-surface-overlay': '#12505d',
      '--goblin-surface-control': '#073642',
      '--goblin-surface-control-hover': '#0b414d',
      '--goblin-text-primary': '#aab6b6',
      '--goblin-text-secondary-strong': '#aab6b6',
      '--goblin-text-secondary': '#93a1a1',
      '--goblin-border-default': '#31515a',
      '--goblin-border-strong': '#4b6971',
      '--goblin-focus-ring': '#268bd2',
      '--goblin-action-primary': '#2aa198',
      '--goblin-action-primary-foreground': '#002b36',
      '--goblin-accent': '#268bd2',
      '--goblin-accent-text': '#58a6d6',
      '--goblin-accent-rgb': '38 139 210',
      '--goblin-terminal-bell': '#d6b84a',
      '--goblin-terminal-bell-rgb': '214 184 74',
      '--color-overlay-scrim': 'rgb(0 0 0 / 0.52)',
      '--goblin-shadow-xs': '0 1px 1px rgb(0 0 0 / 0.24)',
      '--goblin-shadow-sm': '0 1px 2px rgb(0 0 0 / 0.30)',
      '--goblin-shadow-md': '0 6px 18px rgb(0 0 0 / 0.38)',
      '--goblin-shadow-lg': '0 14px 36px rgb(0 0 0 / 0.46)',
      '--radius': '0.25rem',
      '--goblin-topbar-bg': '#001f27',
      '--goblin-topbar-border': '#31515a',
      '--goblin-topbar-fg': '#aab6b6',
      '--goblin-topbar-muted-fg': '#93a1a1',
      '--goblin-toolbar-bg': '#073642',
      '--goblin-toolbar-border': '#31515a',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#0b414d',
      '--goblin-tab-active-bg': '#12505d',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.22)',
      '--goblin-list-row-selected-fg': '#aab6b6',
      '--goblin-control-radius': '0.25rem',
      '--goblin-brand-radius-sm': '0.125rem',
      '--goblin-brand-radius-md': '0.25rem',
      '--goblin-brand-radius-lg': '0.375rem',
      '--color-terminal-background': '#002b36',
      '--color-terminal-foreground': '#93a1a1',
      '--color-terminal-cursor': '#93a1a1',
      '--color-terminal-selection-background': 'rgb(38 139 210 / 0.28)',
      '--color-terminal-search-match': '#b58900',
      '--color-terminal-search-active-match': '#268bd2',
      '--color-terminal-search-active-border': '#93a1a1',
    })

    const standard = ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5']
    const bright = ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']
    expectAnsiValues(light, standard, bright)
    expectAnsiValues(dark, standard, bright)

    for (const [mode, block] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const bell = parseHexRgb(cssTokenValue(block, '--goblin-terminal-bell'))
      for (const surface of bellContrastSurfaces(block)) {
        expect(contrastRatio(bell, surface.rgb), `solarized/${mode} bell against ${surface.label}`)
          .toBeGreaterThanOrEqual(3)
      }
      expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
      expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control-hover')
      expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
      expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
    }
  })

  test('keeps Tokyo Night aligned with Day and Night', () => {
    expect(existsSync(themeCssPath('tokyo-night')), 'tokyo-night.css exists').toBe(true)
    expectCompletePreset('tokyo-night')

    const css = readThemeCss('tokyo-night')
    const light = selectorBlock(css, 'tokyo-night', 'light')
    const dark = selectorBlock(css, 'tokyo-night', 'dark')

    expectTokenValues(light, {
      '--goblin-surface-canvas': '#e6e7ed',
      '--goblin-surface-base': '#d8dae4',
      '--goblin-surface-raised': '#f2f3f7',
      '--goblin-surface-overlay': '#f2f3f7',
      '--goblin-surface-control': '#f2f3f7',
      '--goblin-surface-control-hover': '#dfe1e8',
      '--goblin-text-primary': '#343b58',
      '--goblin-text-secondary-strong': '#3b4261',
      '--goblin-text-secondary': '#40434f',
      '--goblin-border-default': '#b4b8c9',
      '--goblin-border-strong': '#969db1',
      '--goblin-focus-ring': '#2959aa',
      '--goblin-action-primary': '#2959aa',
      '--goblin-action-primary-foreground': '#ffffff',
      '--goblin-accent': '#2959aa',
      '--goblin-accent-text': '#2959aa',
      '--goblin-accent-rgb': '41 89 170',
      '--goblin-terminal-bell': '#8f5e15',
      '--goblin-terminal-bell-rgb': '143 94 21',
      '--color-overlay-scrim': 'rgb(52 59 88 / 0.40)',
      '--goblin-shadow-xs': '0 1px 1px rgb(52 59 88 / 0.04)',
      '--goblin-shadow-sm': '0 1px 2px rgb(52 59 88 / 0.06)',
      '--goblin-shadow-md': '0 8px 24px rgb(52 59 88 / 0.12)',
      '--goblin-shadow-lg': '0 18px 48px rgb(52 59 88 / 0.16)',
      '--radius': '0.375rem',
      '--goblin-topbar-bg': '#c7cbda',
      '--goblin-topbar-border': '#adb2c4',
      '--goblin-topbar-fg': '#343b58',
      '--goblin-topbar-muted-fg': '#40434f',
      '--goblin-toolbar-bg': '#d8dae4',
      '--goblin-toolbar-border': '#b4b8c9',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#dfe1e8',
      '--goblin-tab-active-bg': '#e6e7ed',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.14)',
      '--goblin-list-row-selected-fg': '#343b58',
      '--goblin-control-radius': '0.375rem',
      '--goblin-brand-radius-sm': '0.25rem',
      '--goblin-brand-radius-md': '0.375rem',
      '--goblin-brand-radius-lg': '0.5rem',
      '--color-terminal-background': '#e6e7ed',
      '--color-terminal-foreground': '#343b58',
      '--color-terminal-cursor': '#343b58',
      '--color-terminal-selection-background': 'rgb(41 89 170 / 0.22)',
      '--color-terminal-search-match': '#8f5e15',
      '--color-terminal-search-active-match': '#2959aa',
      '--color-terminal-search-active-border': '#343b58',
    })

    expectTokenValues(dark, {
      '--goblin-surface-canvas': '#1a1b26',
      '--goblin-surface-base': '#24283b',
      '--goblin-surface-raised': '#2d324a',
      '--goblin-surface-overlay': '#343b58',
      '--goblin-surface-control': '#24283b',
      '--goblin-surface-control-hover': '#2d324a',
      '--goblin-text-primary': '#c0caf5',
      '--goblin-text-secondary-strong': '#a9b1d6',
      '--goblin-text-secondary': '#9aa5ce',
      '--goblin-border-default': '#414868',
      '--goblin-border-strong': '#565f89',
      '--goblin-focus-ring': '#7aa2f7',
      '--goblin-action-primary': '#7aa2f7',
      '--goblin-action-primary-foreground': '#1a1b26',
      '--goblin-accent': '#7aa2f7',
      '--goblin-accent-text': '#7aa2f7',
      '--goblin-accent-rgb': '122 162 247',
      '--goblin-terminal-bell': '#e0af68',
      '--goblin-terminal-bell-rgb': '224 175 104',
      '--color-overlay-scrim': 'rgb(0 0 0 / 0.56)',
      '--goblin-shadow-xs': '0 1px 1px rgb(0 0 0 / 0.28)',
      '--goblin-shadow-sm': '0 1px 2px rgb(0 0 0 / 0.34)',
      '--goblin-shadow-md': '0 8px 24px rgb(0 0 0 / 0.44)',
      '--goblin-shadow-lg': '0 18px 48px rgb(0 0 0 / 0.52)',
      '--radius': '0.375rem',
      '--goblin-topbar-bg': '#16161e',
      '--goblin-topbar-border': '#414868',
      '--goblin-topbar-fg': '#c0caf5',
      '--goblin-topbar-muted-fg': '#9aa5ce',
      '--goblin-toolbar-bg': '#24283b',
      '--goblin-toolbar-border': '#414868',
      '--goblin-tab-bg': 'transparent',
      '--goblin-tab-hover-bg': '#2d324a',
      '--goblin-tab-active-bg': '#343b58',
      '--goblin-list-row-bg': 'transparent',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.22)',
      '--goblin-list-row-selected-fg': '#c0caf5',
      '--goblin-control-radius': '0.375rem',
      '--goblin-brand-radius-sm': '0.25rem',
      '--goblin-brand-radius-md': '0.375rem',
      '--goblin-brand-radius-lg': '0.5rem',
      '--color-terminal-background': '#1a1b26',
      '--color-terminal-foreground': '#c0caf5',
      '--color-terminal-cursor': '#c0caf5',
      '--color-terminal-selection-background': 'rgb(122 162 247 / 0.28)',
      '--color-terminal-search-match': '#e0af68',
      '--color-terminal-search-active-match': '#7aa2f7',
      '--color-terminal-search-active-border': '#c0caf5',
    })

    expectAnsiValues(
      light,
      ['#343b58', '#8c4351', '#385f0d', '#8f5e15', '#2959aa', '#5a3e8e', '#0f4b6e', '#6c6e75'],
      ['#6c6e75', '#8c4351', '#33635c', '#965027', '#2959aa', '#5a3e8e', '#006c86', '#343b58'],
    )
    expectAnsiValues(
      dark,
      ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
      ['#565f89', '#f7768e', '#73daca', '#ff9e64', '#7dcfff', '#bb9af7', '#b4f9f8', '#c0caf5'],
    )

    for (const [mode, block] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const bell = parseHexRgb(cssTokenValue(block, '--goblin-terminal-bell'))
      for (const surface of bellContrastSurfaces(block)) {
        expect(contrastRatio(bell, surface.rgb), `tokyo-night/${mode} bell against ${surface.label}`)
          .toBeGreaterThanOrEqual(3)
      }
      expectContrastAtLeast(block, '--goblin-text-primary', '--goblin-surface-canvas')
      expectContrastAtLeast(block, '--goblin-text-secondary', '--goblin-surface-base')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control')
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-surface-control-hover')
      expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
      expectContrastAtLeast(block, '--color-terminal-foreground', '--color-terminal-background')
    }
  })

  test('keeps GitHub aligned with the Enterprise Graphite design', () => {
    const css = readThemeCss('github')
    const light = selectorBlock(css, 'github', 'light')
    const dark = selectorBlock(css, 'github', 'dark')

    expectTokenValues(light, {
      '--goblin-surface-canvas': '#ffffff',
      '--goblin-surface-base': '#f6f8fa',
      '--goblin-surface-raised': '#ffffff',
      '--goblin-surface-hover': '#f3f4f6',
      '--goblin-action-primary': '#1f883d',
      '--goblin-accent': '#1a7f37',
      '--goblin-accent-text': '#116329',
      '--goblin-accent-rgb': '26 127 55',
      '--goblin-topbar-bg': '#f6f8fa',
      '--goblin-topbar-border': '#d0d7de',
      '--goblin-topbar-fg': '#1f2328',
      '--goblin-topbar-muted-fg': '#59636e',
      '--goblin-topbar-control-bg': '#ffffff',
      '--goblin-topbar-control-hover-bg': '#f3f4f6',
      '--goblin-topbar-control-border': '#afb8c1',
      '--goblin-topbar-control-fg': '#1f2328',
      '--goblin-toolbar-bg': '#ffffff',
      '--goblin-sidebar-bg': '#f6f8fa',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.12)',
      '--goblin-list-row-selected-fg': '#116329',
    })

    expectTokenValues(dark, {
      '--goblin-surface-canvas': '#0d1117',
      '--goblin-surface-base': '#161b22',
      '--goblin-surface-raised': '#161b22',
      '--goblin-surface-hover': '#30363d',
      '--goblin-action-primary': '#238636',
      '--goblin-accent': '#3fb950',
      '--goblin-accent-text': '#7ee787',
      '--goblin-accent-rgb': '63 185 80',
      '--goblin-topbar-bg': '#161b22',
      '--goblin-topbar-border': '#30363d',
      '--goblin-topbar-fg': '#e6edf3',
      '--goblin-topbar-muted-fg': '#8b949e',
      '--goblin-topbar-control-bg': '#21262d',
      '--goblin-topbar-control-hover-bg': '#30363d',
      '--goblin-topbar-control-border': '#484f58',
      '--goblin-topbar-control-fg': '#e6edf3',
      '--goblin-toolbar-bg': '#161b22',
      '--goblin-sidebar-bg': '#161b22',
      '--goblin-list-row-selected-bg': 'rgb(var(--goblin-accent-rgb) / 0.17)',
      '--goblin-list-row-selected-fg': '#7ee787',
    })

    for (const block of [light, dark]) {
      expectContrastAtLeast(block, '--goblin-topbar-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-muted-fg', '--goblin-topbar-bg')
      expectContrastAtLeast(block, '--goblin-topbar-control-fg', '--goblin-topbar-control-bg')
      expectContrastAtLeast(block, '--goblin-action-primary-foreground', '--goblin-action-primary')
    }
  })

  test('keeps cursor aligned with the Cursor 3 Agents Window design', () => {
    const cursorCss = readThemeCss('cursor')
    const claudeCss = readThemeCss('claude')
    const light = selectorBlock(cursorCss, 'cursor', 'light')
    const dark = selectorBlock(cursorCss, 'cursor', 'dark')
    const claudeLight = selectorBlock(claudeCss, 'claude', 'light')
    const claudeDark = selectorBlock(claudeCss, 'claude', 'dark')

    expectTokenValues(light, {
      '--goblin-surface-canvas': '#f7f7f5',
      '--goblin-surface-base': '#ececea',
      '--goblin-surface-raised': '#ffffff',
      '--goblin-surface-hover': '#e6e6e3',
      '--goblin-text-primary': '#1b1b1b',
      '--goblin-text-secondary': '#73736f',
      '--goblin-border-default': '#d8d8d4',
      '--goblin-action-primary': '#1b1b1b',
      '--goblin-accent': '#1b1b1b',
      '--goblin-topbar-bg': '#f1f1ef',
      '--goblin-toolbar-bg': '#f7f7f5',
      '--goblin-sidebar-bg': '#ececea',
      '--goblin-control-radius': '0.375rem',
      '--color-terminal-background': '#ffffff',
      '--color-terminal-foreground': '#1b1b1b',
    })
    expectTokenValues(dark, {
      '--goblin-surface-canvas': '#181818',
      '--goblin-surface-base': '#202020',
      '--goblin-surface-raised': '#242424',
      '--goblin-surface-hover': '#292929',
      '--goblin-text-primary': '#ededed',
      '--goblin-text-secondary': '#949494',
      '--goblin-border-default': '#343434',
      '--goblin-action-primary': '#ededed',
      '--goblin-accent': '#ededed',
      '--goblin-topbar-bg': '#1d1d1d',
      '--goblin-toolbar-bg': '#242424',
      '--goblin-sidebar-bg': '#202020',
      '--goblin-control-radius': '0.375rem',
      '--color-terminal-background': '#181818',
      '--color-terminal-foreground': '#ededed',
    })

    expect(light).not.toContain('#f54e00')
    expect(dark).not.toContain('#f54e00')
    expect(cssTokenValue(light, '--goblin-surface-canvas')).not.toBe(
      cssTokenValue(claudeLight, '--goblin-surface-canvas'),
    )
    expect(cssTokenValue(dark, '--goblin-surface-canvas')).not.toBe(
      cssTokenValue(claudeDark, '--goblin-surface-canvas'),
    )
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

  test('keeps original Hobgoblin presets aligned with their design briefs', () => {
    const signalLight = selectorBlock(readThemeCss('signal'), 'signal', 'light')
    const signalDark = selectorBlock(readThemeCss('signal'), 'signal', 'dark')
    const forgeLight = selectorBlock(readThemeCss('forge'), 'forge', 'light')
    const forgeDark = selectorBlock(readThemeCss('forge'), 'forge', 'dark')

    expect(signalLight).toContain('--goblin-surface-canvas: #f8fbfb;')
    expect(signalLight).toContain('--goblin-action-primary: #009b8f;')
    expect(signalLight).toContain('--goblin-terminal-bell: #8a6400;')
    expect(signalDark).toContain('--goblin-surface-canvas: #0f1b1a;')
    expect(signalDark).toContain('--color-terminal-background: #0f2423;')

    expect(forgeLight).toContain('--goblin-surface-canvas: #f6f3ec;')
    expect(forgeLight).toContain('--goblin-action-primary: #b6531c;')
    expect(forgeLight).toContain('--goblin-terminal-bell: #1f7a55;')
    expect(forgeDark).toContain('--goblin-surface-canvas: #18110d;')
    expect(forgeDark).toContain('--color-terminal-background: #201813;')
  })
})
