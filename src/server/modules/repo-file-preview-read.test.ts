import { mkdtemp, mkdir, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readRepositoryFilePreview } from '#/server/modules/repo-file-preview-read.ts'

const mocks = vi.hoisted(() => ({
  resolveRemoteRepoTarget: vi.fn(),
  readRemoteFileTreeTextFile: vi.fn(),
  readRemoteFileTreeBinaryFile: vi.fn(),
}))

vi.mock('#/server/modules/repo-backend.ts', () => ({ resolveRemoteRepoTarget: mocks.resolveRemoteRepoTarget }))
vi.mock('#/system/ssh/git.ts', () => ({
  readRemoteFileTreeTextFile: mocks.readRemoteFileTreeTextFile,
  readRemoteFileTreeBinaryFile: mocks.readRemoteFileTreeBinaryFile,
}))

describe('readRepositoryFilePreview', () => {
  beforeEach(() => vi.clearAllMocks())

  test('reads an absolute text file outside the repository with normalized path segments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'file-preview-'))
    await mkdir(path.join(root, 'repo'))
    await writeFile(path.join(root, 'report.md'), 'preview')

    await expect(
      readRepositoryFilePreview(path.join(root, 'repo'), `${root}/repo/../report.md`, 'text'),
    ).resolves.toEqual({
      ok: true,
      content: 'preview',
      byteLength: 7,
    })
  })

  test('reads image bytes and enforces fixed text and image size limits', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'file-preview-'))
    const filePath = path.join(root, 'preview.png')
    await writeFile(filePath, Buffer.from([0, 1, 2]))
    await expect(readRepositoryFilePreview('/repo', filePath, 'image')).resolves.toMatchObject({
      ok: true,
      byteLength: 3,
      bytesBase64: 'AAEC',
    })
    await truncate(filePath, 1024 * 1024 + 1)
    await expect(readRepositoryFilePreview('/repo', filePath, 'text')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-text-file-too-large',
    })
    await truncate(filePath, 20 * 1024 * 1024 + 1)
    await expect(readRepositoryFilePreview('/repo', filePath, 'image')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-file-too-large',
    })
  })

  test('preserves missing-file and directory failures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'file-preview-'))
    await expect(readRepositoryFilePreview('/repo', path.join(root, 'missing.md'), 'text')).resolves.toEqual({
      ok: false,
      message: 'error.path-not-found',
    })
    await expect(readRepositoryFilePreview('/repo', root, 'text')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-not-regular-file',
    })
  })

  test.each(['report.md', '../report.md', '', '/exports/report\0.md', 'file:///exports/report.md'])(
    'rejects non-absolute or invalid file paths: %s',
    async (filePath) => {
      await expect(readRepositoryFilePreview('/repo', filePath, 'text')).resolves.toEqual({
        ok: false,
        message: 'error.invalid-arguments',
      })
    },
  )

  test.each(['text', 'image'] as const)(
    'reads remote %s files from the repository host with fixed limits',
    async (kind) => {
      const remoteTarget = { host: 'example-host' }
      mocks.resolveRemoteRepoTarget.mockResolvedValue(remoteTarget)
      const result = { ok: false, message: 'error.path-not-found' }
      mocks.readRemoteFileTreeTextFile.mockResolvedValue(result)
      mocks.readRemoteFileTreeBinaryFile.mockResolvedValue(result)
      const signal = new AbortController().signal
      const repoId = 'ssh-config://example-host/srv/repo'

      await expect(readRepositoryFilePreview(repoId, '/exports/reports/../report.md', kind, signal)).resolves.toEqual(
        result,
      )
      expect(mocks.resolveRemoteRepoTarget).toHaveBeenCalledWith(repoId)
      if (kind === 'text') {
        expect(mocks.readRemoteFileTreeTextFile).toHaveBeenCalledWith(remoteTarget, '/exports', '/exports/report.md', {
          signal,
        })
      } else {
        expect(mocks.readRemoteFileTreeBinaryFile).toHaveBeenCalledWith(
          remoteTarget,
          '/exports',
          '/exports/report.md',
          20 * 1024 * 1024,
          { signal },
        )
      }
    },
  )

  test('cancels before resolving the remote host or starting a read', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      readRepositoryFilePreview('ssh-config://example-host/srv/repo', '/exports/report.md', 'text', controller.signal),
    ).resolves.toEqual({
      ok: false,
      message: 'cancelled',
    })
    expect(mocks.resolveRemoteRepoTarget).not.toHaveBeenCalled()
  })

  test('only reads drive-qualified local Windows paths and rejects UNC before filesystem access', async () => {
    const readText = vi.fn(async () => ({ ok: true, content: 'preview', byteLength: 7 }))
    const readImage = vi.fn()
    vi.resetModules()
    vi.doMock('node:path', () => ({ default: path.win32 }))
    vi.doMock('#/system/file-tree/local.ts', () => ({
      readLocalFileTreeTextFile: readText,
      readLocalFileTreeBinaryFile: readImage,
    }))
    try {
      const { readRepositoryFilePreview: readWindowsPreview } =
        await import('#/server/modules/repo-file-preview-read.ts')
      for (const filePath of [
        '\\\\example-host\\share\\report.md',
        '//example-host/share/report.md',
        '\\\\?\\UNC\\example-host\\share\\report.md',
        '\\\\?\\C:\\exports\\report.md',
        '\\exports\\report.md',
        '/exports/report.md',
        'C:report.md',
      ]) {
        await expect(readWindowsPreview('C:\\repo', filePath, 'text')).resolves.toEqual({
          ok: false,
          message: 'error.invalid-arguments',
        })
      }
      expect(readText).not.toHaveBeenCalled()
      expect(readImage).not.toHaveBeenCalled()

      await expect(readWindowsPreview('C:\\repo', 'D:/exports/docs/../report.md', 'text')).resolves.toMatchObject({
        ok: true,
      })
      expect(readText).toHaveBeenCalledWith('D:\\exports', 'D:\\exports\\report.md')
    } finally {
      vi.doUnmock('node:path')
      vi.doUnmock('#/system/file-tree/local.ts')
      vi.resetModules()
    }
  })
})
