import type { ResolvedTheme } from '#/shared/rpc.ts'
import type { ColorTheme } from '#/shared/color-theme.ts'

// Main needs a window background before renderer CSS loads. Keep these
// values in sync with each theme's `--goblin-surface-canvas` until themes
// become data-driven and main can read the persisted canvas token.
export const WINDOW_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  macos: {
    light: '#ffffff',
    dark: '#000000',
  },
  mono: {
    light: '#ffffff',
    dark: '#09090b',
  },
  github: {
    light: '#ffffff',
    dark: '#0d1117',
  },
  claude: {
    light: '#faf9f5',
    dark: '#181715',
  },
  cursor: {
    light: '#f7f7f4',
    dark: '#1f1f1c',
  },
  airbnb: {
    light: '#ffffff',
    dark: '#111111',
  },
  bmw: {
    light: '#f5f5f5',
    dark: '#000000',
  },
  signal: {
    light: '#f8fbfb',
    dark: '#0f1b1a',
  },
  forge: {
    light: '#f6f3ec',
    dark: '#18110d',
  },
  catppuccin: {
    light: '#eff1f5',
    dark: '#1e1e2e',
  },
  solarized: {
    light: '#fdf6e3',
    dark: '#002b36',
  },
  'tokyo-night': {
    light: '#e6e7ed',
    dark: '#1a1b26',
  },
}

// Native title bar overlays must match the renderer topbar rather than the
// window canvas. Presets without a distinct topbar retain the canvas color.
export const TOPBAR_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  ...WINDOW_BACKGROUND_BY_COLOR_THEME,
  github: {
    light: '#f6f8fa',
    dark: '#161b22',
  },
}
