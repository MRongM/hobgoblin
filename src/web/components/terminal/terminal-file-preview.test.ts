import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createTerminalFilePreviewTarget,
  readTerminalFilePreview,
  terminalFilePreviewKind,
  terminalFilePreviewIdentity,
} from '#/web/components/terminal/terminal-file-preview.ts'
import {
  readRepositoryFilePreview,
  readRepositoryFileTreeBinaryFile,
  readRepositoryFileTreeTextFile,
} from '#/web/repo-client.ts'

vi.mock('#/web/repo-client.ts', () => ({
  readRepositoryFilePreview: vi.fn(),
  readRepositoryFileTreeBinaryFile: vi.fn(),
  readRepositoryFileTreeTextFile: vi.fn(),
}))

beforeEach(() => vi.resetAllMocks())

describe('terminalFilePreviewKind', () => {
  test.each([
    'txt',
    'text',
    'md',
    'mdx',
    'markdown',
    'log',
    'json',
    'jsonl',
    'yaml',
    'yml',
    'toml',
    'xml',
    'csv',
    'tsv',
    'ini',
    'conf',
    'config',
    'sh',
    'bash',
    'zsh',
    'fish',
    'ps1',
    'bat',
    'cmd',
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'mts',
    'cts',
    'py',
    'rb',
    'go',
    'rs',
    'c',
    'h',
    'cpp',
    'hpp',
    'cs',
    'java',
    'kt',
    'swift',
    'php',
    'html',
    'css',
    'scss',
    'sql',
    'vue',
    'svelte',
  ])('classifies .%s as source text', (extension) => {
    expect(terminalFilePreviewKind(`src/example.${extension}`)).toBe('text')
  })

  test.each(['Dockerfile', 'Makefile', 'README', 'LICENSE', '.gitignore', '.env', '.env.local', '.editorconfig'])(
    'classifies common extensionless configuration %s',
    (name) => {
      expect(terminalFilePreviewKind(`config/${name}`)).toBe('text')
    },
  )

  test.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])(
    'classifies .%s as an image',
    (extension) => {
      expect(terminalFilePreviewKind(`images/example.${extension}`)).toBe('image')
    },
  )

  test.each([
    'document.pdf',
    'document.docx',
    'archive.zip',
    'photo.tiff',
    'photo.heic',
    'unknown',
    'image.png.exe',
    'source.ts/',
  ])('leaves unsupported paths to existing reveal: %s', (path) => {
    expect(terminalFilePreviewKind(path)).toBeNull()
  })

  test('matches names and extensions case-insensitively across path separators', () => {
    expect(terminalFilePreviewKind('C:\\repo\\SOURCE.TSX')).toBe('text')
    expect(terminalFilePreviewKind('/repo/IMAGE.PNG')).toBe('image')
    expect(terminalFilePreviewKind('/repo/MAKEFILE')).toBe('text')
  })
})

describe('createTerminalFilePreviewTarget', () => {
  test('keeps the original target and location while normalizing a safe relative path', () => {
    const target = { path: './src/app.ts', line: 12, column: 4 }
    expect(createTerminalFilePreviewTarget('repo', '/workspace', target)).toEqual({
      repoId: 'repo',
      worktreePath: '/workspace',
      target,
      relativePath: 'src/app.ts',
      kind: 'text',
    })
    expect(createTerminalFilePreviewTarget('repo', '/workspace', target)?.target).toBe(target)
  })

  test.each([
    ['/workspace', '/workspace/src/../app.ts', 'app.ts'],
    ['C:\\workspace', 'c:/WORKSPACE/src/app.ts', 'src/app.ts'],
    ['C:\\workspace', 'src/app.ts', 'src/app.ts'],
  ])('accepts contained paths for %s and %s', (root, path, relativePath) => {
    expect(createTerminalFilePreviewTarget('repo', root, { path })).toMatchObject({ relativePath, kind: 'text' })
  })

  test.each([
    ['/workspace', '../outside.ts'],
    ['/workspace', 'src/../../outside.ts'],
    ['/workspace', 'src\\app.ts'],
    ['/workspace', 'src/app\0.ts'],
    ['/workspace', '/workspace/app\0.ts'],
    ['/workspace', 'src//app.ts'],
    ['/workspace', '/workspace'],
    ['/workspace', 'C:\\workspace\\app.ts'],
    ['C:\\workspace', '/workspace/app.ts'],
    ['\\\\host\\share', '\\\\host\\share\\app.ts'],
    ['/workspace', 'archive.zip'],
  ])('rejects unsafe, incompatible, or unsupported target %s / %s', (root, path) => {
    expect(createTerminalFilePreviewTarget('repo', root, { path })).toBeNull()
  })

  test.each([
    ['/workspace', '/workspace-other/app.ts'],
    ['/workspace', '/workspace/../outside.ts'],
    ['/workspace', '/elsewhere/my report.md'],
    ['C:\\workspace', 'D:\\reports\\app.ts'],
    ['C:\\workspace', 'C:\\workspace\\..\\app.ts'],
  ])('accepts an external absolute document on the same host: %s / %s', (root, path) => {
    expect(createTerminalFilePreviewTarget('repo', root, { path })).toMatchObject({ relativePath: null, kind: 'text' })
  })

  test('uses one identity for equivalent Windows paths regardless of casing, separators or line reference', () => {
    const relative = createTerminalFilePreviewTarget('repo', 'C:\\workspace', { path: 'src/App.ts', line: 1 })!
    const absolute = createTerminalFilePreviewTarget('repo', 'C:\\workspace', {
      path: 'c:/WORKSPACE/src/app.ts',
      line: 8,
    })!
    expect(terminalFilePreviewIdentity(relative)).toBe(terminalFilePreviewIdentity(absolute))
  })
})

describe('readTerminalFilePreview', () => {
  test.each(['text', 'image'] as const)(
    'reads external %s files through the dedicated absolute-file endpoint',
    async (kind) => {
      const target = createTerminalFilePreviewTarget('repo', '/workspace', {
        path: kind === 'text' ? '/tmp/report.md' : '/tmp/image.png',
      })!
      const signal = new AbortController().signal
      vi.mocked(readRepositoryFilePreview).mockResolvedValue({ ok: false, message: 'missing' })
      await expect(readTerminalFilePreview(target, signal)).resolves.toMatchObject({
        ok: false,
        kind,
        relativePath: null,
      })
      expect(readRepositoryFilePreview).toHaveBeenCalledWith('repo', target.target.path, kind, signal)
      expect(readRepositoryFileTreeTextFile).not.toHaveBeenCalled()
      expect(readRepositoryFileTreeBinaryFile).not.toHaveBeenCalled()
    },
  )
  test('reads text with an absolute worktree path and carries its result and signal', async () => {
    const target = createTerminalFilePreviewTarget('repo', '/workspace', { path: 'src/app.ts', line: 3 })!
    const signal = new AbortController().signal
    vi.mocked(readRepositoryFileTreeTextFile).mockResolvedValue({ ok: true, content: '<script>\n', byteLength: 9 })
    await expect(readTerminalFilePreview(target, signal)).resolves.toEqual({
      ok: true,
      content: '<script>\n',
      byteLength: 9,
      kind: 'text',
      relativePath: 'src/app.ts',
    })
    expect(readRepositoryFileTreeTextFile).toHaveBeenCalledWith('repo', '/workspace', '/workspace/src/app.ts', signal)
    expect(readRepositoryFileTreeBinaryFile).not.toHaveBeenCalled()
  })

  test('bounds images to exactly 20 MiB and allows a missing MIME type', async () => {
    const target = createTerminalFilePreviewTarget('repo', 'C:\\workspace', { path: 'images/photo.png' })!
    const signal = new AbortController().signal
    const result = { ok: true as const, name: 'photo.png', byteLength: 3, bytesBase64: 'AQID' }
    vi.mocked(readRepositoryFileTreeBinaryFile).mockResolvedValue(result)
    await expect(readTerminalFilePreview(target, signal)).resolves.toEqual({
      ...result,
      kind: 'image',
      relativePath: 'images/photo.png',
    })
    expect(readRepositoryFileTreeBinaryFile).toHaveBeenCalledWith(
      'repo',
      'C:\\workspace',
      'C:\\workspace\\images\\photo.png',
      20 * 1024 * 1024,
      signal,
    )
    expect(readRepositoryFileTreeTextFile).not.toHaveBeenCalled()
  })

  test.each(['text', 'image'] as const)('preserves backend %s read failures', async (kind) => {
    const target = createTerminalFilePreviewTarget('repo', '/workspace', {
      path: kind === 'text' ? 'app.ts' : 'photo.png',
    })!
    vi.mocked(readRepositoryFileTreeTextFile).mockResolvedValue({ ok: false, message: 'File is too large' })
    vi.mocked(readRepositoryFileTreeBinaryFile).mockResolvedValue({ ok: false, message: 'File is too large' })
    await expect(readTerminalFilePreview(target)).resolves.toEqual({
      ok: false,
      message: 'File is too large',
      kind,
      relativePath: target.relativePath,
    })
  })

  test('preserves rejected aborts for the caller lifecycle', async () => {
    const target = createTerminalFilePreviewTarget('repo', '/workspace', { path: '/workspace/app.ts' })!
    const controller = new AbortController()
    controller.abort()
    vi.mocked(readRepositoryFileTreeTextFile).mockRejectedValue(controller.signal.reason)
    await expect(readTerminalFilePreview(target, controller.signal)).rejects.toBe(controller.signal.reason)
  })
})
