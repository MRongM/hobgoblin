// Keep this in sync with the pre-React allowlist in `src/web/public/boot.js`.
export const COLOR_THEMES = ['macos', 'mono', 'github', 'claude', 'cursor', 'airbnb', 'bmw'] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]

export const DEFAULT_COLOR_THEME: ColorTheme = 'macos'

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEMES.includes(value as ColorTheme)
}

export function normalizeColorTheme(value: unknown): ColorTheme {
  if (value === 'apple') return 'macos'
  return isColorTheme(value) ? value : DEFAULT_COLOR_THEME
}
