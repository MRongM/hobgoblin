import { describe, expect, test } from 'vitest'
import { isFileAreaTabDropOutsideViewport } from '#/web/lib/detached-file-area.ts'

describe('detached file area drag intent', () => {
  test.each([
    { clientX: -1, clientY: 50 },
    { clientX: 901, clientY: 50 },
    { clientX: 450, clientY: -1 },
    { clientX: 450, clientY: 601 },
  ])('detects a release outside the viewport: %#', (point) => {
    expect(isFileAreaTabDropOutsideViewport(point, { width: 900, height: 600 })).toBe(true)
  })

  test('keeps releases on the viewport boundary inside the source window', () => {
    expect(isFileAreaTabDropOutsideViewport({ clientX: 0, clientY: 0 }, { width: 900, height: 600 })).toBe(false)
    expect(isFileAreaTabDropOutsideViewport({ clientX: 900, clientY: 600 }, { width: 900, height: 600 })).toBe(false)
  })
})
