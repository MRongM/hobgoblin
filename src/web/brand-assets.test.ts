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
    expect(svg).toContain('id="terminal-window"')
    expect(svg).toContain('id="prompt-glyph"')
    expect(svg).toContain('id="terminal-baseline"')
    expect(svg).toContain('id="branch-path"')
    expect(svg).not.toContain('id="tile-gradient"')
    expect(svg).not.toContain('fill="url(#tile-gradient)"')
  })

  test('keeps published PNG icon assets at 1024px square', () => {
    for (const assetPath of pngAssets) {
      expect(readPngDimensions(assetPath)).toEqual({ width: 1024, height: 1024 })
    }
  })

  test('keeps generated icons full bleed at the macOS dock edge', () => {
    for (const assetPath of pngAssets) {
      const png = PNG.sync.read(readFileSync(assetPath))

      expect(readPixel(png, 512, 0)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 0, 512)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 1023, 512)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 512, 1023)).toEqual(expect.objectContaining({ dark: true }))
      expect(readPixel(png, 0, 0)).toEqual(expect.objectContaining({ transparent: true }))
      expect(readPixel(png, 1023, 0)).toEqual(expect.objectContaining({ transparent: true }))
      expect(readPixel(png, 0, 1023)).toEqual(expect.objectContaining({ transparent: true }))
      expect(readPixel(png, 1023, 1023)).toEqual(expect.objectContaining({ transparent: true }))
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
