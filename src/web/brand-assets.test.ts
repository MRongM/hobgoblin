import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Uint8Array } } }
}

const pngAssets = [
  'assets/icon.png',
  'assets/icon-mac-1024.png',
  'docs/goblin.png',
  'src/web/public/goblin.png',
]

describe('brand assets', () => {
  test('keeps a source SVG for the full-bleed Hobgoblin terminal branch icon', () => {
    const svg = readFileSync('assets/hobgoblin-icon.svg', 'utf8')

    expect(svg).toContain('aria-labelledby="title"')
    expect(svg).toContain('>Hobgoblin full-bleed dark terminal branch icon</title>')
    expect(svg).toContain('data-direction="b1-dark-terminal"')
    expect(svg).toContain('data-edge="terminal-full-bleed"')
    expect(svg).toContain('data-window-controls="none"')
    expect(svg).toContain('data-foreground-scale="0.8"')
    expect(svg).toContain('data-foreground-shift="-26,-36"')
    expect(svg).toContain('data-branch-shift-y="72"')
    expect(svg).toContain('id="terminal-window"')
    expect(svg).toContain('id="prompt-glyph"')
    expect(svg).toContain('id="terminal-baseline"')
    expect(svg).toContain('id="branch-path"')
    expect(svg).not.toContain('id="tile-gradient"')
    expect(svg).not.toContain('fill="url(#tile-gradient)"')
    expect(svg).not.toContain('#ef4444')
    expect(svg).not.toContain('#f59e0b')
  })

  test('keeps published PNG icon assets at 1024px square', () => {
    for (const assetPath of pngAssets) {
      expect(readPngDimensions(assetPath)).toEqual({ width: 1024, height: 1024 })
    }
  })

  test('keeps generated icons opaque and full bleed at the macOS dock edge', () => {
    for (const assetPath of pngAssets) {
      const png = PNG.sync.read(readFileSync(assetPath))

      expect(readPixel(png, 512, 0)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 0, 512)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 1023, 512)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 512, 1023)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 0, 0)).toEqual(expect.objectContaining({ dark: true, transparent: false }))
      expect(readPixel(png, 1023, 0)).toEqual(expect.objectContaining({ dark: true, transparent: false }))
      expect(readPixel(png, 0, 1023)).toEqual(expect.objectContaining({ dark: true, transparent: false }))
      expect(readPixel(png, 1023, 1023)).toEqual(expect.objectContaining({ dark: true, transparent: false }))
      expect(readAlphaStats(png)).toEqual({ transparent: 0, translucent: 0 })
      expect(readForegroundBounds(png)).toEqual(expect.objectContaining({ wide: true, tall: true, compact: true }))
    }
  })
})

function readPngDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path)
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function readPixel(
  png: { width: number; data: Uint8Array },
  x: number,
  y: number,
): { dark: boolean; transparent: boolean; rgba: number[] } {
  const offset = (y * png.width + x) * 4
  const rgba = Array.from(png.data.slice(offset, offset + 4))
  return {
    dark: rgba[0] < 64 && rgba[1] < 80 && rgba[2] < 110 && rgba[3] === 255,
    transparent: rgba[3] === 0,
    rgba,
  }
}

function readAlphaStats(png: { width: number; height: number; data: Uint8Array }): {
  transparent: number
  translucent: number
} {
  let transparent = 0
  let translucent = 0
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3] ?? 0
      if (alpha === 0) transparent += 1
      else if (alpha < 255) translucent += 1
    }
  }
  return { transparent, translucent }
}

function readForegroundBounds(png: { width: number; height: number; data: Uint8Array }): {
  wide: boolean
  tall: boolean
  compact: boolean
  bounds: { width: number; height: number }
} {
  let minX = png.width
  let minY = png.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4
      const r = png.data[offset] ?? 0
      const g = png.data[offset + 1] ?? 0
      const b = png.data[offset + 2] ?? 0
      const a = png.data[offset + 3] ?? 0
      const isBackground = r < 30 && g < 40 && b < 70
      if (a === 0 || isBackground) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  return {
    wide: width >= 735,
    tall: height >= 570,
    compact: width <= 780 && height <= 610,
    bounds: { width, height },
  }
}
