// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  measureTerminalGeometry,
} from '#/web/components/terminal/terminal-geometry.ts'

function measurableHost(width: number, height: number): HTMLElement {
  const host = document.createElement('div')
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  })
  return host
}

describe('DEFAULT_TERMINAL_FONT_FAMILY', () => {
  test('uses the bundled CJK monospace font for stable terminal cell metrics', () => {
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toBe("'Maple Mono NF CN', monospace")
  })
})

describe('measureTerminalGeometry', () => {
  test('derives terminal columns and rows from host and cell size', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(1320, 820),
        fontSize: 14,
        fontFamily: 'ui-monospace, monospace',
        measureCell: () => ({ width: 10, height: 20 }),
      }),
    ).toEqual({ cols: 132, rows: 41 })
  })

  test('returns null for an unmeasurable host', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(0, 820),
        fontSize: 14,
        fontFamily: 'ui-monospace, monospace',
        measureCell: () => ({ width: 10, height: 20 }),
      }),
    ).toBeNull()
  })

  test('uses current font size and family when measuring cells', () => {
    const measureCell = vi.fn((fontSize: number, fontFamily: string) => ({
      width: fontFamily.includes('Maple') ? fontSize / 2 : fontSize,
      height: fontSize,
    }))

    expect(
      measureTerminalGeometry({
        host: measurableHost(700, 420),
        fontSize: 14,
        fontFamily: "'Maple Mono NF CN', monospace",
        measureCell,
      }),
    ).toEqual({ cols: 100, rows: 30 })
    expect(
      measureTerminalGeometry({
        host: measurableHost(700, 420),
        fontSize: 20,
        fontFamily: 'system-ui, sans-serif',
        measureCell,
      }),
    ).toEqual({ cols: 35, rows: 21 })
    expect(measureCell).toHaveBeenCalledWith(14, "'Maple Mono NF CN', monospace")
    expect(measureCell).toHaveBeenCalledWith(20, 'system-ui, sans-serif')
  })

  test('uses the shared terminal font when no font family is provided', () => {
    const measureCell = vi.fn(() => ({ width: 7, height: 14 }))

    expect(
      measureTerminalGeometry({
        host: measurableHost(700, 420),
        fontSize: 14,
        measureCell,
      }),
    ).toEqual({ cols: 100, rows: 30 })
    expect(measureCell).toHaveBeenCalledWith(14, DEFAULT_TERMINAL_FONT_FAMILY)
  })

  test('uses unit line height when measuring the default cell box', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    let measuredLineHeight = ''
    appendSpy.mockImplementation((node) => {
      if (node instanceof HTMLElement && node.textContent === 'MMMMMMMMMM') {
        measuredLineHeight = node.style.lineHeight
        vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
          x: 0,
          y: 0,
          width: 84,
          height: 14,
          top: 0,
          right: 84,
          bottom: 14,
          left: 0,
          toJSON: () => ({}),
        })
      }
      return HTMLElement.prototype.appendChild.call(document.body, node)
    })
    try {
      expect(
        measureTerminalGeometry({
          host: measurableHost(840, 420),
          fontSize: 14,
          fontFamily: 'ui-monospace, monospace',
        }),
      ).toEqual({ cols: 100, rows: 30 })
      expect(measuredLineHeight).toBe('1')
    } finally {
      appendSpy.mockRestore()
    }
  })

  test('clamps proposed geometry to supported terminal bounds', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(2000, 1000),
        fontSize: 14,
        fontFamily: 'ui-monospace, monospace',
        measureCell: () => ({ width: 1, height: 1 }),
      }),
    ).toEqual({ cols: 500, rows: 300 })
  })
})
