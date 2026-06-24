// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { measureTerminalGeometry } from '#/web/components/terminal/terminal-geometry.ts'

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

describe('measureTerminalGeometry', () => {
  test('derives terminal columns and rows from host and cell size', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(1320, 820),
        fontSize: 14,
        measureCell: () => ({ width: 10, height: 20 }),
      }),
    ).toEqual({ cols: 132, rows: 41 })
  })

  test('returns null for an unmeasurable host', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(0, 820),
        fontSize: 14,
        measureCell: () => ({ width: 10, height: 20 }),
      }),
    ).toBeNull()
  })

  test('uses current font size when measuring cells', () => {
    const measureCell = vi.fn((fontSize: number) => ({ width: fontSize / 2, height: fontSize }))

    expect(
      measureTerminalGeometry({
        host: measurableHost(700, 420),
        fontSize: 14,
        measureCell,
      }),
    ).toEqual({ cols: 100, rows: 30 })
    expect(
      measureTerminalGeometry({
        host: measurableHost(700, 420),
        fontSize: 20,
        measureCell,
      }),
    ).toEqual({ cols: 70, rows: 21 })
    expect(measureCell).toHaveBeenCalledWith(14)
    expect(measureCell).toHaveBeenCalledWith(20)
  })

  test('clamps proposed geometry to supported terminal bounds', () => {
    expect(
      measureTerminalGeometry({
        host: measurableHost(2000, 1000),
        fontSize: 14,
        measureCell: () => ({ width: 1, height: 1 }),
      }),
    ).toEqual({ cols: 500, rows: 300 })
  })
})
