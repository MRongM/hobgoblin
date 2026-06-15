import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  MAX_CLIPBOARD_BINARY_FILE_BYTES,
  MAX_CLIPBOARD_BINARY_TOTAL_BYTES,
} from '#/shared/clipboard-binary-temp-files.ts'
import { saveClipboardBinaryFilesToTemp } from '#/main/clipboard-binary-temp-files.ts'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `gbl-${label}-`))
  roots.push(root)
  return root
}

function bytes(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}

function bufferWithByteLength(byteLength: number): ArrayBuffer {
  return { byteLength } as ArrayBuffer
}

describe('saveClipboardBinaryFilesToTemp', () => {
  test('writes files to the worktree tmp directory by default', async () => {
    const worktreePath = await tempRoot('worktree')
    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: '',
        files: [{ name: 'screenshot.png', type: 'image/png', bytes: bytes('png') }],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 30),
        randomHex: () => 'a8f31c9d',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(worktreePath, 'tmp', 'pasted-20260615-221530-a8f31c9d.png')],
    })
    if (result.ok) await expect(readFile(result.paths[0]!, 'utf8')).resolves.toBe('png')
  })

  test('uses a configured absolute temporary directory', async () => {
    const worktreePath = await tempRoot('worktree')
    const configured = await tempRoot('configured')
    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: configured,
        files: [{ name: 'report.pdf', type: 'application/pdf', bytes: bytes('pdf') }],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 31),
        randomHex: () => '4b91d0aa',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(configured, 'pasted-20260615-221531-4b91d0aa.pdf')],
    })
  })

  test('infers extensions from mime type when the file name has no extension', async () => {
    const worktreePath = await tempRoot('worktree')
    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: '',
        files: [{ name: 'clipboard', type: 'image/jpeg', bytes: bytes('jpg') }],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 32),
        randomHex: () => '12345678',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(worktreePath, 'tmp', 'pasted-20260615-221532-12345678.jpg')],
    })
  })

  test('falls back to bin extension for unknown binary content', async () => {
    const worktreePath = await tempRoot('worktree')
    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: '',
        files: [{ name: '', type: 'application/octet-stream', bytes: bytes('raw') }],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 33),
        randomHex: () => 'abcdef12',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(worktreePath, 'tmp', 'pasted-20260615-221533-abcdef12.bin')],
    })
  })

  test('does not overwrite an existing random filename', async () => {
    const worktreePath = await tempRoot('worktree')
    const existing = join(worktreePath, 'tmp')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(existing, { recursive: true })
    await writeFile(join(existing, 'pasted-20260615-221534-deadbeef.png'), 'existing')

    let index = 0
    const values = ['deadbeef', 'cafebabe']
    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: '',
        files: [{ name: 'image.png', type: 'image/png', bytes: bytes('new') }],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 34),
        randomHex: () => values[index++] ?? 'feedface',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(worktreePath, 'tmp', 'pasted-20260615-221534-cafebabe.png')],
    })
  })

  test('copies source file paths to the worktree tmp directory', async () => {
    const worktreePath = await tempRoot('worktree')
    const sourceRoot = await tempRoot('source')
    const sourcePath = join(sourceRoot, 'desktop report.pdf')
    await writeFile(sourcePath, 'pdf')

    const result = await saveClipboardBinaryFilesToTemp(
      {
        worktreePath,
        temporaryFilesDirectory: '',
        files: [],
        sourcePaths: [sourcePath],
      },
      {
        now: new Date(2026, 5, 15, 22, 15, 35),
        randomHex: () => '13579bdf',
      },
    )

    expect(result).toEqual({
      ok: true,
      paths: [join(worktreePath, 'tmp', 'pasted-20260615-221535-13579bdf.pdf')],
    })
    if (result.ok) await expect(readFile(result.paths[0]!, 'utf8')).resolves.toBe('pdf')
  })

  test('rejects invalid worktree paths and oversized payloads', async () => {
    await expect(
      saveClipboardBinaryFilesToTemp({
        worktreePath: 'relative',
        temporaryFilesDirectory: '',
        files: [{ name: 'x.bin', type: '', bytes: bytes('x') }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-path' })

    await expect(
      saveClipboardBinaryFilesToTemp({
        worktreePath: await tempRoot('worktree'),
        temporaryFilesDirectory: '',
        files: [{ name: 'large.bin', type: '', bytes: bufferWithByteLength(MAX_CLIPBOARD_BINARY_FILE_BYTES + 1) }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.file-too-large' })

    const eightyMb = 80 * 1024 * 1024
    await expect(
      saveClipboardBinaryFilesToTemp({
        worktreePath: await tempRoot('worktree'),
        temporaryFilesDirectory: '',
        files: [
          { name: 'a.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
          { name: 'b.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
          { name: 'c.bin', type: '', bytes: bufferWithByteLength(eightyMb) },
        ],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.file-too-large' })
  })
})
