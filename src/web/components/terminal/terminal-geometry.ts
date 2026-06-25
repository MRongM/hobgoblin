import { TERMINAL_SIZE_LIMITS, normalizeTerminalSize } from '#/shared/terminal.ts'

export const TERMINAL_FONT_FAMILY = "'Maple Mono NF CN', monospace"
export const TERMINAL_LINE_HEIGHT = 1.2

export interface TerminalGeometry {
  cols: number
  rows: number
}

export function measureTerminalGeometry(input: {
  host: HTMLElement
  fontSize: number
  measureCell?: (fontSize: number) => { width: number; height: number } | null
}): TerminalGeometry | null {
  const rect = input.host.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const cell = input.measureCell ? input.measureCell(input.fontSize) : measureTerminalCell(input.host, input.fontSize)
  if (!cell || cell.width <= 0 || cell.height <= 0) return null

  const cols = clamp(Math.floor(rect.width / cell.width), TERMINAL_SIZE_LIMITS.minCols, TERMINAL_SIZE_LIMITS.maxCols)
  const rows = clamp(Math.floor(rect.height / cell.height), TERMINAL_SIZE_LIMITS.minRows, TERMINAL_SIZE_LIMITS.maxRows)
  return normalizeTerminalSize(cols, rows)
}

function measureTerminalCell(host: HTMLElement, fontSize: number): { width: number; height: number } | null {
  const document = host.ownerDocument
  const body = document.body
  if (!body) return fallbackCell(fontSize)

  const probe = document.createElement('span')
  probe.textContent = 'MMMMMMMMMM'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.whiteSpace = 'pre'
  probe.style.fontFamily = TERMINAL_FONT_FAMILY
  probe.style.fontSize = `${fontSize}px`
  probe.style.lineHeight = String(TERMINAL_LINE_HEIGHT)
  body.appendChild(probe)
  try {
    const rect = probe.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return fallbackCell(fontSize)
    return { width: rect.width / 10, height: rect.height }
  } finally {
    probe.remove()
  }
}

function fallbackCell(fontSize: number): { width: number; height: number } {
  return { width: Math.max(1, fontSize * 0.6), height: Math.max(1, fontSize * TERMINAL_LINE_HEIGHT) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
