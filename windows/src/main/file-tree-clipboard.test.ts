import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  userDataPath: '',
  clipboard: {
    availableFormats: vi.fn(),
    clear: vi.fn(),
    readBuffer: vi.fn(),
    readImage: vi.fn(),
    readText: vi.fn(),
    write: vi.fn(),
    writeBuffer: vi.fn(),
    writeImage: vi.fn(),
    writeText: vi.fn(),
  },
  nativeImage: {
    createFromBuffer: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electron.userDataPath),
  },
  clipboard: electron.clipboard,
  nativeImage: electron.nativeImage,
}))

const clipboardPathMocks = vi.hoisted(() => ({
  readClipboardFilePathsFromSystem: vi.fn((): string[] => []),
}))

vi.mock('#/main/clipboard-file-paths.ts', () => ({
  readClipboardFilePathsFromSystem: clipboardPathMocks.readClipboardFilePathsFromSystem,
}))

describe('file tree clipboard', () => {
  beforeEach(async () => {
    electron.userDataPath = await mkdtemp(join(tmpdir(), 'gbl-file-tree-clipboard-'))
    electron.clipboard.availableFormats.mockReset()
    electron.clipboard.clear.mockReset()
    electron.clipboard.readBuffer.mockReset()
    electron.clipboard.readImage.mockReset()
    electron.clipboard.readText.mockReset()
    electron.clipboard.write.mockReset()
    electron.clipboard.writeBuffer.mockReset()
    electron.clipboard.writeImage.mockReset()
    electron.clipboard.writeText.mockReset()
    electron.nativeImage.createFromBuffer.mockReset()
    clipboardPathMocks.readClipboardFilePathsFromSystem.mockReset()
    electron.clipboard.availableFormats.mockReturnValue([])
    electron.clipboard.readBuffer.mockReturnValue(Buffer.alloc(0))
    electron.clipboard.readImage.mockReturnValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })
    electron.clipboard.readText.mockReturnValue('')
    electron.nativeImage.createFromBuffer.mockReturnValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })
    clipboardPathMocks.readClipboardFilePathsFromSystem.mockReturnValue([])
  })

  afterEach(async () => {
    if (electron.userDataPath) await rm(electron.userDataPath, { recursive: true, force: true })
  })

  test('writes text content as plain text only', async () => {
    const { writeFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const file = {
      name: 'report.txt',
      byteLength: 5,
      bytesBase64: Buffer.from('hello').toString('base64'),
      text: 'hello',
      mimeType: 'text/plain',
    }

    await expect(writeFileTreeClipboardFile(file)).resolves.toEqual({ ok: true })

    expect(electron.clipboard.clear).toHaveBeenCalled()
    expect(electron.clipboard.writeText).toHaveBeenCalledWith('hello')
    expect(electron.clipboard.writeImage).not.toHaveBeenCalled()
    expect(electron.clipboard.write).not.toHaveBeenCalled()
    expect(electron.clipboard.writeBuffer).not.toHaveBeenCalled()
  })

  test('writes image content as a native image only', async () => {
    const { writeFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const image = { isEmpty: () => false, toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    electron.nativeImage.createFromBuffer.mockReturnValue(image)

    await expect(
      writeFileTreeClipboardFile({
        name: 'image.png',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ ok: true })

    expect(electron.nativeImage.createFromBuffer).toHaveBeenCalledWith(bytes)
    expect(electron.clipboard.clear).toHaveBeenCalled()
    expect(electron.clipboard.writeImage).toHaveBeenCalledWith(image)
    expect(electron.clipboard.writeText).not.toHaveBeenCalled()
    expect(electron.clipboard.write).not.toHaveBeenCalled()
    expect(electron.clipboard.writeBuffer).not.toHaveBeenCalled()
  })

  test('rejects non-text non-image content', async () => {
    const { writeFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')

    await expect(
      writeFileTreeClipboardFile({
        name: 'archive.zip',
        byteLength: 4,
        bytesBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-unsupported-content',
    })

    expect(electron.clipboard.clear).not.toHaveBeenCalled()
    expect(electron.clipboard.writeText).not.toHaveBeenCalled()
    expect(electron.clipboard.writeImage).not.toHaveBeenCalled()
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

  test('reads plain text clipboard content', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    electron.clipboard.readText.mockReturnValue('hello')

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({
      ok: true,
      file: {
        name: 'clipboard.txt',
        byteLength: 5,
        bytesBase64: Buffer.from('hello').toString('base64'),
        text: 'hello',
        mimeType: 'text/plain',
      },
    })
  })

  test('does not read system clipboard file paths as file content', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    const source = join(electron.userDataPath, 'report.pdf')
    await writeFile(source, Buffer.from('%PDF'))
    clipboardPathMocks.readClipboardFilePathsFromSystem.mockReturnValue([source])

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(clipboardPathMocks.readClipboardFilePathsFromSystem).not.toHaveBeenCalled()
  })

  test('does not read common binary clipboard formats', async () => {
    const { readFileTreeClipboardFile } = await import('#/main/file-tree-clipboard.ts')
    electron.clipboard.availableFormats.mockReturnValue(['application/pdf'])
    electron.clipboard.readBuffer.mockReturnValue(Buffer.from('%PDF'))

    await expect(readFileTreeClipboardFile(30 * 1024 * 1024)).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(electron.clipboard.availableFormats).not.toHaveBeenCalled()
    expect(electron.clipboard.readBuffer).not.toHaveBeenCalled()
  })
})
