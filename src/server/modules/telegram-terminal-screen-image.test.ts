import { describe, expect, test } from 'vitest'
import { TELEGRAM_PHOTO_MAX_BYTES } from '#/shared/telegram-notifications.ts'
import type { TerminalScreenSnapshot } from '#/shared/terminal.ts'
import { renderTelegramTerminalScreenImage } from '#/server/modules/telegram-terminal-screen-image.ts'

const SESSION_ID = 'term_1234567890123456'

function snapshot(overrides: Partial<TerminalScreenSnapshot> = {}): TerminalScreenSnapshot {
  return {
    sessionId: SESSION_ID,
    lines: ['bun run test', '✓ 42 tests passed'],
    columns: 80,
    rows: 24,
    sequence: 42,
    ...overrides,
  }
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (marker !== undefined && marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

describe('Telegram terminal screen image', () => {
  test('renders a bounded low-quality JPEG entirely in memory', async () => {
    const image = await renderTelegramTerminalScreenImage(snapshot())

    expect(image?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(image?.byteLength).toBeLessThanOrEqual(TELEGRAM_PHOTO_MAX_BYTES)
    expect(image && jpegDimensions(image)).toEqual({ width: 752, height: 464 })
  }, 30_000)

  test('caps large terminal screens at 1280 by 720', async () => {
    const image = await renderTelegramTerminalScreenImage(
      snapshot({
        lines: Array.from({ length: 40 }, (_, index) => `${index}`.padEnd(140, 'x')),
        columns: 140,
        rows: 40,
      }),
    )

    expect(image && jpegDimensions(image)).toEqual({ width: 1280, height: 720 })
  }, 30_000)

  test('escapes markup and strips terminal control characters before rendering', async () => {
    const image = await renderTelegramTerminalScreenImage(
      snapshot({ lines: ['<script>& "quoted"', 'safe\u0000\u0007text'], rows: 2 }),
    )

    expect(image?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  }, 30_000)

  test('does not create an image for an empty terminal screen', async () => {
    await expect(renderTelegramTerminalScreenImage(snapshot({ lines: ['', '   '], rows: 2 }))).resolves.toBeNull()
  })
})
