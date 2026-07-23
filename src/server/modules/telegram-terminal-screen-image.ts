import { Buffer } from 'node:buffer'
import {
  TELEGRAM_PHOTO_MAX_BYTES,
  TELEGRAM_TERMINAL_SCREEN_MAX_COLUMNS,
  TELEGRAM_TERMINAL_SCREEN_MAX_ROWS,
} from '#/shared/telegram-notifications.ts'
import type { TerminalScreenSnapshot } from '#/shared/terminal.ts'

const TELEGRAM_TERMINAL_SCREEN_IMAGE_MAX_WIDTH = 1_280
const TELEGRAM_TERMINAL_SCREEN_IMAGE_MAX_HEIGHT = 720
const TELEGRAM_TERMINAL_SCREEN_IMAGE_MIN_WIDTH = 320
const TELEGRAM_TERMINAL_SCREEN_IMAGE_MIN_HEIGHT = 180
const TERMINAL_SCREEN_HORIZONTAL_PADDING = 32
const TERMINAL_SCREEN_VERTICAL_PADDING = 32
const TERMINAL_SCREEN_CELL_WIDTH = 9
const TERMINAL_SCREEN_LINE_HEIGHT = 18
const TERMINAL_SCREEN_JPEG_QUALITY = 65
type SharpFactory = typeof import('sharp')['default']
let sharpFactoryPromise: Promise<SharpFactory> | undefined

export async function renderTelegramTerminalScreenImage(snapshot: TerminalScreenSnapshot): Promise<Buffer | null> {
  if (!validSnapshot(snapshot)) return null
  const columns = Math.min(snapshot.columns, TELEGRAM_TERMINAL_SCREEN_MAX_COLUMNS)
  const rows = Math.min(snapshot.rows, TELEGRAM_TERMINAL_SCREEN_MAX_ROWS)
  const lines = snapshot.lines.slice(-rows).map((line) => sanitizedLine(line, columns))
  while (lines.length < rows) lines.push('')
  if (!lines.some((line) => line.trim())) return null

  const width = clampedDimension(
    columns * TERMINAL_SCREEN_CELL_WIDTH + TERMINAL_SCREEN_HORIZONTAL_PADDING,
    TELEGRAM_TERMINAL_SCREEN_IMAGE_MIN_WIDTH,
    TELEGRAM_TERMINAL_SCREEN_IMAGE_MAX_WIDTH,
  )
  const height = clampedDimension(
    rows * TERMINAL_SCREEN_LINE_HEIGHT + TERMINAL_SCREEN_VERTICAL_PADDING,
    TELEGRAM_TERMINAL_SCREEN_IMAGE_MIN_HEIGHT,
    TELEGRAM_TERMINAL_SCREEN_IMAGE_MAX_HEIGHT,
  )
  const availableLineHeight = (height - TERMINAL_SCREEN_VERTICAL_PADDING) / rows
  const lineHeight = Math.min(TERMINAL_SCREEN_LINE_HEIGHT, availableLineHeight)
  const fontSize = Math.max(10, Math.min(14, lineHeight - 3))
  const firstBaseline = 16 + fontSize
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="16" y="${(firstBaseline + index * lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`,
    )
    .join('')
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="#0d1117"/>` +
      `<text fill="#e6edf3" font-family="monospace" font-size="${fontSize}" xml:space="preserve">${text}</text>` +
      '</svg>',
    'utf8',
  )

  const sharp = await loadSharp()
  const image = await sharp(svg, { limitInputPixels: TELEGRAM_TERMINAL_SCREEN_IMAGE_MAX_WIDTH * 720 })
    .jpeg({ quality: TERMINAL_SCREEN_JPEG_QUALITY, progressive: true })
    .toBuffer()
  return image.byteLength <= TELEGRAM_PHOTO_MAX_BYTES ? image : null
}

async function loadSharp(): Promise<SharpFactory> {
  sharpFactoryPromise ??= import('sharp').then((module) => module.default)
  return await sharpFactoryPromise
}

function validSnapshot(snapshot: TerminalScreenSnapshot): boolean {
  return (
    !!snapshot &&
    Array.isArray(snapshot.lines) &&
    snapshot.lines.every((line) => typeof line === 'string') &&
    Number.isInteger(snapshot.columns) &&
    snapshot.columns > 0 &&
    Number.isInteger(snapshot.rows) &&
    snapshot.rows > 0
  )
}

function sanitizedLine(value: string, maxColumns: number): string {
  const printable = value.replace(/[\u0000-\u001f\u007f]/gu, '')
  return Array.from(printable).slice(0, maxColumns).join('')
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    if (character === '&') return '&amp;'
    if (character === '<') return '&lt;'
    if (character === '>') return '&gt;'
    if (character === '"') return '&quot;'
    return '&apos;'
  })
}

function clampedDimension(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)))
}
