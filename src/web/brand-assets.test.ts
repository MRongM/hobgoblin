import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const pngAssets = [
  'assets/icon.png',
  'assets/icon-mac-1024.png',
  'docs/goblin.png',
  'src/web/public/goblin.png',
]

describe('brand assets', () => {
  test('keeps a source SVG for the B1 Hobgoblin terminal branch icon', () => {
    const svg = readFileSync('assets/hobgoblin-icon.svg', 'utf8')

    expect(svg).toContain('aria-labelledby="title"')
    expect(svg).toContain('>Hobgoblin dark terminal branch icon</title>')
    expect(svg).toContain('data-direction="b1-dark-terminal"')
    expect(svg).toContain('id="terminal-window"')
    expect(svg).toContain('id="prompt-glyph"')
    expect(svg).toContain('id="terminal-baseline"')
    expect(svg).toContain('id="branch-path"')
  })

  test('keeps published PNG icon assets at 1024px square', () => {
    for (const assetPath of pngAssets) {
      expect(readPngDimensions(assetPath)).toEqual({ width: 1024, height: 1024 })
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
