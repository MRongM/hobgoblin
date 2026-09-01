import { beforeEach, describe, expect, test, vi } from 'vitest'

const readImage = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ clipboard: { readImage } }))

import { readClipboardImageFromSystem } from '#/main/clipboard-image.ts'

describe('readClipboardImageFromSystem', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns a PNG payload for a non-empty clipboard image', () => {
    readImage.mockReturnValue({ isEmpty: () => false, toPNG: () => Buffer.from([1, 2, 3]) })

    const result = readClipboardImageFromSystem(10)

    expect(result).toMatchObject({ name: 'clipboard.png', type: 'image/png' })
    expect(Array.from(new Uint8Array(result!.bytes))).toEqual([1, 2, 3])
  })

  test('returns null for an empty clipboard image', () => {
    const toPNG = vi.fn()
    readImage.mockReturnValue({ isEmpty: () => true, toPNG })

    expect(readClipboardImageFromSystem(10)).toBeNull()
    expect(toPNG).not.toHaveBeenCalled()
  })

  test('returns null for an oversized clipboard image', () => {
    readImage.mockReturnValue({ isEmpty: () => false, toPNG: () => Buffer.from([1, 2, 3]) })

    expect(readClipboardImageFromSystem(2)).toBeNull()
  })

  test('returns null when native PNG conversion fails', () => {
    readImage.mockReturnValue({
      isEmpty: () => false,
      toPNG: () => {
        throw new Error('conversion failed')
      },
    })

    expect(readClipboardImageFromSystem(10)).toBeNull()
  })
})
