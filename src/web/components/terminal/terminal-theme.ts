import type { ITheme } from '@xterm/xterm'
import type { ISearchOptions } from '@xterm/addon-search'
import type { TerminalWindowsPtyAppearance } from '#/shared/terminal.ts'
type TerminalSearchDecorations = NonNullable<ISearchOptions['decorations']>

export const TERMINAL_THEME_TOKENS_CHANGED_EVENT = 'theme-tokens-changed'
export type TerminalThemeMode = 'theme' | 'classic'

const TERMINAL_THEME_TOKEN_MAP = {
  background: '--color-terminal-background',
  foreground: '--color-terminal-foreground',
  cursor: '--color-terminal-cursor',
  selectionBackground: '--color-terminal-selection-background',
  black: '--color-terminal-ansi-black',
  red: '--color-terminal-ansi-red',
  green: '--color-terminal-ansi-green',
  yellow: '--color-terminal-ansi-yellow',
  blue: '--color-terminal-ansi-blue',
  magenta: '--color-terminal-ansi-magenta',
  cyan: '--color-terminal-ansi-cyan',
  white: '--color-terminal-ansi-white',
  brightBlack: '--color-terminal-ansi-bright-black',
  brightRed: '--color-terminal-ansi-bright-red',
  brightGreen: '--color-terminal-ansi-bright-green',
  brightYellow: '--color-terminal-ansi-bright-yellow',
  brightBlue: '--color-terminal-ansi-bright-blue',
  brightMagenta: '--color-terminal-ansi-bright-magenta',
  brightCyan: '--color-terminal-ansi-bright-cyan',
  brightWhite: '--color-terminal-ansi-bright-white',
} as const

const TERMINAL_SEARCH_TOKEN_MAP = {
  match: '--color-terminal-search-match',
  activeMatch: '--color-terminal-search-active-match',
  activeBorder: '--color-terminal-search-active-border',
} as const

const TERMINAL_THEME_SAFE_DEFAULTS: Record<keyof typeof TERMINAL_THEME_TOKEN_MAP, string> = {
  background: 'black',
  foreground: 'white',
  cursor: 'white',
  selectionBackground: 'rgba(255, 255, 255, 0.24)',
  black: 'black',
  red: 'red',
  green: 'lime',
  yellow: 'yellow',
  blue: 'deepskyblue',
  magenta: 'magenta',
  cyan: 'cyan',
  white: 'silver',
  brightBlack: 'gray',
  brightRed: 'tomato',
  brightGreen: 'lime',
  brightYellow: 'gold',
  brightBlue: 'lightskyblue',
  brightMagenta: 'violet',
  brightCyan: 'lightskyblue',
  brightWhite: 'white',
}

const TERMINAL_SEARCH_SAFE_DEFAULTS: Record<keyof typeof TERMINAL_SEARCH_TOKEN_MAP, string> = {
  match: 'gold',
  activeMatch: 'orange',
  activeBorder: 'white',
}

type Rgb = {
  red: number
  green: number
  blue: number
}

export function terminalThemeForCurrentDocument(mode: TerminalThemeMode = 'theme'): ITheme {
  const styles = getComputedStyle(document.documentElement)
  const theme = Object.fromEntries(
    Object.entries(TERMINAL_THEME_TOKEN_MAP).map(([key, token]) => [
      key,
      cssTokenForMode(styles, token, mode, TERMINAL_THEME_SAFE_DEFAULTS[key as keyof typeof TERMINAL_THEME_TOKEN_MAP]),
    ]),
  ) as ITheme
  return theme
}

export function terminalWindowsPtyAppearanceForCurrentDocument(
  mode: TerminalThemeMode = 'theme',
): TerminalWindowsPtyAppearance {
  const theme = terminalThemeForCurrentDocument(mode)
  return {
    foreground: parseCssRgb(theme.foreground) ?? { red: 255, green: 255, blue: 255 },
    background: parseCssRgb(theme.background) ?? { red: 0, green: 0, blue: 0 },
  }
}

export function terminalSearchDecorationsForCurrentDocument(
  mode: TerminalThemeMode = 'theme',
): TerminalSearchDecorations {
  const styles = getComputedStyle(document.documentElement)
  const match = cssTokenForMode(styles, TERMINAL_SEARCH_TOKEN_MAP.match, mode, TERMINAL_SEARCH_SAFE_DEFAULTS.match)
  const activeMatch = cssTokenForMode(
    styles,
    TERMINAL_SEARCH_TOKEN_MAP.activeMatch,
    mode,
    TERMINAL_SEARCH_SAFE_DEFAULTS.activeMatch,
  )
  return {
    matchBackground: match,
    matchOverviewRuler: match,
    activeMatchBackground: activeMatch,
    activeMatchBorder: cssTokenForMode(
      styles,
      TERMINAL_SEARCH_TOKEN_MAP.activeBorder,
      mode,
      TERMINAL_SEARCH_SAFE_DEFAULTS.activeBorder,
    ),
    activeMatchColorOverviewRuler: activeMatch,
  }
}

export function observeTerminalTheme(mode: () => TerminalThemeMode, onTheme: (theme: ITheme) => void): () => void {
  const refresh = () => onTheme(terminalThemeForCurrentDocument(mode()))
  const observer = new MutationObserver(refresh)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-color-theme', 'data-theme-id', 'style'],
  })
  window.addEventListener(TERMINAL_THEME_TOKENS_CHANGED_EVENT, refresh)
  return () => {
    observer.disconnect()
    window.removeEventListener(TERMINAL_THEME_TOKENS_CHANGED_EVENT, refresh)
  }
}

function tokenNameForMode(token: string, mode: TerminalThemeMode): string {
  return mode === 'classic' ? token.replace('--color-terminal-', '--color-terminal-classic-') : token
}

function cssTokenForMode(
  styles: CSSStyleDeclaration,
  token: string,
  mode: TerminalThemeMode,
  fallback: string,
): string {
  if (mode !== 'classic') return cssToken(styles, token, fallback)
  const classic = cssToken(styles, tokenNameForMode(token, mode), '')
  return classic || cssToken(styles, token, fallback)
}

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const resolved = resolveCssValue(styles, styles.getPropertyValue(name).trim(), new Set([name])).trim()
  return resolved || fallback
}

function resolveCssValue(styles: CSSStyleDeclaration, value: string, seen: Set<string>): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]+)?\)/g, (_match, token: string) => {
    if (seen.has(token)) return ''
    seen.add(token)
    const resolved = resolveCssValue(styles, styles.getPropertyValue(token).trim(), seen)
    seen.delete(token)
    return resolved
  })
}

function parseCssRgb(value: string | undefined): Rgb | null {
  if (!value) return null
  const color = value.trim().toLowerCase()
  if (color === 'black') return { red: 0, green: 0, blue: 0 }
  if (color === 'white') return { red: 255, green: 255, blue: 255 }
  const hex = parseHexColor(color)
  if (hex) return hex
  return parseRgbColor(color)
}

function parseHexColor(color: string): Rgb | null {
  const shorthand = /^#([\da-f])([\da-f])([\da-f])$/.exec(color)
  if (shorthand) {
    return {
      red: parseInt(`${shorthand[1]}${shorthand[1]}`, 16),
      green: parseInt(`${shorthand[2]}${shorthand[2]}`, 16),
      blue: parseInt(`${shorthand[3]}${shorthand[3]}`, 16),
    }
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/.exec(color)
  if (!full) return null
  return {
    red: parseInt(full[1], 16),
    green: parseInt(full[2], 16),
    blue: parseInt(full[3], 16),
  }
}

function parseRgbColor(color: string): Rgb | null {
  const match = /^rgba?\((.*)\)$/.exec(color)
  if (!match) return null
  const channels = match[1]
    .replace(/\/.*$/, '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((channel) => Number(channel))
  if (channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) return null
  return {
    red: clampByte(channels[0]),
    green: clampByte(channels[1]),
    blue: clampByte(channels[2]),
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
