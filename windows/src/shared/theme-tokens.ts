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

// Native title bar overlays must match each renderer `--goblin-topbar-bg`
// rather than the window canvas. Keep this projection in sync with the theme
// preset CSS so Win/Linux caption controls share one continuous surface.
export const TOPBAR_BACKGROUND_BY_COLOR_THEME: Record<ColorTheme, Record<ResolvedTheme, string>> = {
  macos: {
    light: '#d8e7f8',
    dark: '#0d1622',
  },
  mono: {
    light: '#d6d6d8',
    dark: '#151518',
  },
  github: {
    light: '#f6f8fa',
    dark: '#161b22',
  },
  claude: {
    light: '#ead7c9',
    dark: '#211a17',
  },
  cursor: {
    light: '#f1f1ef',
    dark: '#1d1d1d',
  },
  airbnb: {
    light: '#f8d7df',
    dark: '#2a151a',
  },
  bmw: {
    light: '#d7e3f2',
    dark: '#050b14',
  },
  signal: {
    light: '#c8e4df',
    dark: '#102522',
  },
  forge: {
    light: '#ded0ba',
    dark: '#211813',
  },
  catppuccin: {
    light: '#dce0e8',
    dark: '#11111b',
  },
  solarized: {
    light: '#ded7c3',
    dark: '#001f27',
  },
  'tokyo-night': {
    light: '#c7cbda',
    dark: '#16161e',
  },
}
