import type { FontFamilyPref } from '#/shared/rpc.ts'

export interface AppFontFamilyStack {
  sans: string
  mono: string
  terminal: string
}

const SYSTEM_MONO_STACK =
  "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
const SYSTEM_SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_SANS_STACK =
  "'Maple Mono NF CN', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"
const MAPLE_MONO_STACK = "'Maple Mono NF CN', ui-monospace, monospace"

export const APP_FONT_FAMILY_STACKS: Record<FontFamilyPref, AppFontFamilyStack> = {
  mono: {
    sans: SYSTEM_MONO_STACK,
    mono: SYSTEM_MONO_STACK,
    terminal: SYSTEM_MONO_STACK,
  },
  maple: {
    sans: MAPLE_SANS_STACK,
    mono: MAPLE_MONO_STACK,
    terminal: MAPLE_MONO_STACK,
  },
  system: {
    sans: SYSTEM_SANS_STACK,
    mono: SYSTEM_MONO_STACK,
    terminal: SYSTEM_SANS_STACK,
  },
}

export function fontFamilyStackForPref(fontFamily: FontFamilyPref): AppFontFamilyStack {
  return APP_FONT_FAMILY_STACKS[fontFamily]
}

export function applyDocumentFontFamily(document: Document, fontFamily: FontFamilyPref): void {
  const stack = fontFamilyStackForPref(fontFamily)
  const root = document.documentElement
  root.setAttribute('data-font-family', fontFamily)
  root.style.setProperty('--font-sans', stack.sans)
  root.style.setProperty('--font-mono', stack.mono)
}
