// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'
import { sourceFromClipboardEvent } from '#/web/components/file-tree/clipboard.ts'

describe('file tree clipboard sources', () => {
  test('appends timestamps to pasted file item names while preserving extensions', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' })

    const source = await sourceFromClipboardEvent({
      clipboardData: {
        files: [],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    } as unknown as ClipboardEvent)

    expect(source).toEqual({
      kind: 'uploadedItems',
      items: [
        {
          name: expect.stringMatching(/^image-20\d{6}-\d{6}\.png$/),
          mimeType: 'image/png',
          bytesBase64: 'AQID',
          byteLength: 3,
        },
      ],
    })
  })
})
