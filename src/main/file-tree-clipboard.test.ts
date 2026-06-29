import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FILE_TREE_CLIPBOARD_FORMAT } from '#/shared/file-tree-clipboard.ts'

const electron = vi.hoisted(() => ({
  userDataPath: '',
  clipboard: {
    readBuffer: vi.fn(),
    readImage: vi.fn(),
    readText: vi.fn(),
    write: vi.fn(),
    writeBuffer: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electron.userDataPath),
  },
  clipboard: electron.clipboard,
}))

vi.mock('#/main/clipboard-file-paths.ts', () => ({
  readClipboardFilePathsFromSystem: vi.fn(() => []),
}))

describe('file tree clipboard', () => {
  beforeEach(async () => {
    electron.userDataPath = await mkdtemp(join(tmpdir(), 'gbl-file-tree-clipboard-'))
    electron.clipboard.readBuffer.mockReset()
    electron.clipboard.readImage.mockReset()
    electron.clipboard.readText.mockReset()
    electron.clipboard.write.mockReset()
    electron.clipboard.writeBuffer.mockReset()
    electron.clipboard.readBuffer.mockReturnValue(Buffer.alloc(0))
    electron.clipboard.readImage.mockReturnValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })
    electron.clipboard.readText.mockReturnValue('')
  })

  afterEach(async () => {
    if (electron.userDataPath) await rm(electron.userDataPath, { recursive: true, force: true })
  })

  test('writes and reads Hobgoblin custom file content format', async () => {
    const { readFileTreeClipboardFile, writeFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const file = {
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
    }

    await expect(
      writeFileTreeClipboardFile(file, { now: new Date('2026-06-29T00:00:00Z'), randomHex: () => 'aabbccdd' }),
    ).resolves.toEqual({ ok: true })

    const customCall = electron.clipboard.writeBuffer.mock.calls.find(([format]) => format === FILE_TREE_CLIPBOARD_FORMAT)
    expect(customCall).toBeTruthy()
    electron.clipboard.readBuffer.mockReturnValue(customCall?.[1] as Buffer)

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({ ok: true, file })
  })

  test('keeps the custom payload readable after writing file URL compatibility formats', async () => {
    const { readFileTreeClipboardFile, writeFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const file = {
      name: 'report.txt',
      byteLength: 5,
      bytesBase64: Buffer.from('hello').toString('base64'),
      text: 'hello',
      mimeType: 'text/plain',
    }

    await expect(writeFileTreeClipboardFile(file, { randomHex: () => '11223344' })).resolves.toEqual({ ok: true })

    const customIndex = electron.clipboard.writeBuffer.mock.calls.findIndex(([format]) => format === FILE_TREE_CLIPBOARD_FORMAT)
    const uriListIndex = electron.clipboard.writeBuffer.mock.calls.findIndex(([format]) => format === 'text/uri-list')
    expect(customIndex).toBeGreaterThanOrEqual(0)
    expect(uriListIndex).toBeGreaterThan(customIndex)
    electron.clipboard.readBuffer.mockReturnValue(electron.clipboard.writeBuffer.mock.calls[customIndex]?.[1] as Buffer)

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({ ok: true, file })
  })

  test('reads system clipboard images as PNG file content', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    electron.clipboard.readImage.mockReturnValue({ isEmpty: () => false, toPNG: () => bytes })

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({
      ok: true,
      file: {
        name: 'clipboard.png',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: 'image/png',
      },
    })
  })
})
