// Shared chrome heights for renderer topbars, Win/Linux titleBarOverlay, and
// macOS traffic-light centering. Keep native chrome and renderer layout on
// shared settings-backed defaults so future tweaks do not drift.
import type { ColorTheme } from '#/shared/color-theme.ts'
import type { ResolvedTheme } from '#/shared/rpc.ts'

export const DEFAULT_TOPBAR_HEIGHT_PX = 34
export const DEFAULT_TOOLBAR_HEIGHT_PX = 34
export const MIN_CHROME_HEIGHT_PX = 30
export const MAX_CHROME_HEIGHT_PX = 48

export const WINDOW_TOPBAR_HEIGHT_PX = DEFAULT_TOPBAR_HEIGHT_PX
export const APP_TOOLBAR_HEIGHT_PX = DEFAULT_TOOLBAR_HEIGHT_PX

export interface NativeWindowChromeThemeProjection {
  theme: ResolvedTheme
  colorTheme: ColorTheme
  topbarHeightPx: number
}

export function normalizeChromeHeightPx(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(MIN_CHROME_HEIGHT_PX, Math.min(MAX_CHROME_HEIGHT_PX, Math.round(value)))
}
