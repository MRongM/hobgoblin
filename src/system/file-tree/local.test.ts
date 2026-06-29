import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test } from 'vitest'
import {
  createLocalFileTreeDirectory,
  createLocalFileTreeFile,
  deleteLocalFileTreeEntries,
  listLocalFileTreeDirectory,
  moveLocalFileTreeEntries,
  pathInsideRoot,
  readLocalFileTreeBinaryFile,
  readLocalFileTreeTextFile,
  renameLocalFileTreeEntry,
  replaceLocalFileTreeBinaryFile,
  replaceLocalFileTreeTextFile,
} from '#/system/file-tree/local.ts'
import { FILE_TREE_TEXT_FILE_MAX_BYTES } from '#/shared/file-tree.ts'

describe('pathInsideRoot', () => {
  test('accepts root and descendants', () => {
    expect(pathInsideRoot('/repo/worktree', '/repo/worktree')).toBe(true)
    expect(pathInsideRoot('/repo/worktree', '/repo/worktree/src/file.ts')).toBe(true)
  })

  test('rejects siblings and traversal outside root', () => {
    expect(pathInsideRoot('/repo/worktree', '/repo/worktree-other')).toBe(false)
    expect(pathInsideRoot('/repo/worktree', '/repo/other')).toBe(false)
  })
})

describe('listLocalFileTreeDirectory', () => {
  test('lists one directory level with deterministic sorting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'README.md'), '')
    await writeFile(join(root, 'package.json'), '')

    const result = await listLocalFileTreeDirectory(root, root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((entry) => `${entry.kind}:${entry.relativePath}`)).toEqual([
      'directory:docs',
      'directory:src',
      'file:package.json',
      'file:README.md',
    ])
  })

  test('reports symlink target kind without following it for containment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    await writeFile(join(root, 'target.txt'), '')
    await symlink(join(root, 'target.txt'), join(root, 'link.txt'))

    const result = await listLocalFileTreeDirectory(root, root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.find((entry) => entry.name === 'link.txt')).toMatchObject({
      kind: 'symlink',
      targetKind: 'file',
    })
  })

  test('rejects directory outside worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const result = await listLocalFileTreeDirectory(root, tmpdir())
    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
  })
})

describe('renameLocalFileTreeEntry', () => {
  test('renames one file inside the worktree without overwriting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-rename-'))
    const oldPath = join(root, 'README.md')
    const newPath = join(root, 'README-renamed.md')
    await writeFile(oldPath, 'hello')

    const result = await renameLocalFileTreeEntry(root, oldPath, 'README-renamed.md')

    expect(result).toEqual({ ok: true, message: '' })
    expect(existsSync(oldPath)).toBe(false)
    expect(await readFile(newPath, 'utf8')).toBe('hello')
  })

  test('rejects basename values that would move the entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-rename-'))
    const oldPath = join(root, 'README.md')
    await writeFile(oldPath, 'hello')

    await expect(renameLocalFileTreeEntry(root, oldPath, '../escape.md')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(renameLocalFileTreeEntry(root, oldPath, 'nested/file.md')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })

  test('rejects destination overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-rename-'))
    const oldPath = join(root, 'old.md')
    const existingPath = join(root, 'existing.md')
    await writeFile(oldPath, 'old')
    await writeFile(existingPath, 'existing')

    await expect(renameLocalFileTreeEntry(root, oldPath, basename(existingPath))).resolves.toEqual({
      ok: false,
      message: 'error.file-exists',
    })
  })

  test('rejects worktree root rename', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-rename-'))

    await expect(renameLocalFileTreeEntry(root, root, 'renamed-root')).resolves.toEqual({
      ok: false,
      message: 'error.delete-root-forbidden',
    })
  })
})

describe('createLocalFileTreeDirectory', () => {
  test('creates one directory inside an existing worktree directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-dir-'))
    const srcPath = join(root, 'src')
    await mkdir(srcPath)

    const result = await createLocalFileTreeDirectory(root, srcPath, 'components')

    expect(result).toEqual({ ok: true, message: '' })
    expect(existsSync(join(srcPath, 'components'))).toBe(true)
  })

  test('rejects basename values that would create outside the parent directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-dir-'))

    await expect(createLocalFileTreeDirectory(root, root, '../escape')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createLocalFileTreeDirectory(root, root, 'nested/folder')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })

  test('rejects destination overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-dir-'))
    await mkdir(join(root, 'existing'))

    await expect(createLocalFileTreeDirectory(root, root, 'existing')).resolves.toEqual({
      ok: false,
      message: 'error.file-exists',
    })
  })
})

describe('createLocalFileTreeFile', () => {
  test('creates one empty file inside an existing worktree directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-file-'))
    const srcPath = join(root, 'src')
    await mkdir(srcPath)

    const result = await createLocalFileTreeFile(root, srcPath, 'index.ts')

    expect(result).toEqual({ ok: true, message: '' })
    await expect(readFile(join(srcPath, 'index.ts'), 'utf8')).resolves.toBe('')
  })

  test('rejects unsafe file basenames and destination overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-create-file-'))
    await writeFile(join(root, 'existing.txt'), 'old')

    await expect(createLocalFileTreeFile(root, root, '../escape.txt')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createLocalFileTreeFile(root, root, 'nested/file.txt')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createLocalFileTreeFile(root, root, 'existing.txt')).resolves.toEqual({
      ok: false,
      message: 'error.file-exists',
    })
  })
})

describe('readLocalFileTreeTextFile', () => {
  test('reads a regular UTF-8 text file inside the worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-read-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'hello\n')

    await expect(readLocalFileTreeTextFile(root, filePath)).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
  })

  test('rejects directories, symlinks, binary content, invalid UTF-8, and oversized files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-read-text-'))
    const dirPath = join(root, 'src')
    const targetPath = join(root, 'target.txt')
    const linkPath = join(root, 'link.txt')
    const binaryPath = join(root, 'binary.dat')
    const invalidUtf8Path = join(root, 'invalid.txt')
    const largePath = join(root, 'large.txt')
    await mkdir(dirPath)
    await writeFile(targetPath, 'target')
    await symlink(targetPath, linkPath)
    await writeFile(binaryPath, Buffer.from([65, 0, 66]))
    await writeFile(invalidUtf8Path, Buffer.from([0xff, 0xfe]))
    await writeFile(largePath, 'a'.repeat(FILE_TREE_TEXT_FILE_MAX_BYTES + 1))

    await expect(readLocalFileTreeTextFile(root, dirPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-not-regular-file',
    })
    await expect(readLocalFileTreeTextFile(root, linkPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-not-regular-file',
    })
    await expect(readLocalFileTreeTextFile(root, binaryPath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readLocalFileTreeTextFile(root, invalidUtf8Path)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readLocalFileTreeTextFile(root, largePath)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-text-file-too-large',
    })
  })
})

describe('replaceLocalFileTreeTextFile', () => {
  test('replaces a regular UTF-8 text file and returns the previous content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-replace-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'old\n')

    const result = await replaceLocalFileTreeTextFile(root, filePath, 'new\n')

    expect(result).toEqual({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('new\n')
  })

  test('rejects oversized or NUL-containing replacement content without writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-replace-text-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'old')

    await expect(replaceLocalFileTreeTextFile(root, filePath, 'a'.repeat(FILE_TREE_TEXT_FILE_MAX_BYTES + 1))).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-text-file-too-large',
    })
    await expect(replaceLocalFileTreeTextFile(root, filePath, 'a\0b')).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-binary-file',
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('old')
  })
})

describe('readLocalFileTreeBinaryFile', () => {
  test('reads ordinary binary files as base64', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'image.bin')
    await writeFile(filePath, Buffer.from([0, 1, 2, 255]))

    await expect(readLocalFileTreeBinaryFile(root, filePath, 30)).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 4,
      bytesBase64: Buffer.from([0, 1, 2, 255]).toString('base64'),
    })
  })

  test('rejects binary files over max bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'large.bin')
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]))

    await expect(readLocalFileTreeBinaryFile(root, filePath, 3)).resolves.toEqual({
      ok: false,
      message: 'error.file-tree-clipboard-file-too-large',
    })
  })
})

describe('replaceLocalFileTreeBinaryFile', () => {
  test('replaces bytes and returns previous bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-'))
    const filePath = join(root, 'data.bin')
    await writeFile(filePath, Buffer.from([9, 8]))

    const result = await replaceLocalFileTreeBinaryFile(root, filePath, Buffer.from([1, 2]).toString('base64'), 30)

    expect(result).toEqual({
      ok: true,
      previousBytesBase64: Buffer.from([9, 8]).toString('base64'),
      previousByteLength: 2,
    })
    await expect(readFile(filePath)).resolves.toEqual(Buffer.from([1, 2]))
  })
})

describe('deleteLocalFileTreeEntries', () => {
  test('deletes files and directories inside the worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-delete-'))
    const filePath = join(root, 'README.md')
    const dirPath = join(root, 'src')
    await mkdir(dirPath)
    await writeFile(filePath, 'hello')
    await writeFile(join(dirPath, 'index.ts'), 'export {}')

    const result = await deleteLocalFileTreeEntries(root, [filePath, dirPath])

    expect(result).toEqual({ ok: true, message: '' })
    expect(existsSync(filePath)).toBe(false)
    expect(existsSync(dirPath)).toBe(false)
  })

  test('rejects path escape before deleting anything', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-delete-'))
    const filePath = join(root, 'README.md')
    await writeFile(filePath, 'hello')

    const result = await deleteLocalFileTreeEntries(root, [filePath, tmpdir()])

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(existsSync(filePath)).toBe(true)
  })

  test('rejects deleting the worktree root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-delete-'))

    await expect(deleteLocalFileTreeEntries(root, [root])).resolves.toEqual({
      ok: false,
      message: 'error.delete-root-forbidden',
    })
    expect(existsSync(root)).toBe(true)
  })
})

describe('moveLocalFileTreeEntries', () => {
  test('moves files and directories into a target directory without overwriting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-move-'))
    const docsPath = join(root, 'docs')
    const srcPath = join(root, 'src')
    const filePath = join(root, 'README.md')
    await mkdir(docsPath)
    await mkdir(srcPath)
    await writeFile(filePath, 'hello')
    await writeFile(join(srcPath, 'index.ts'), 'export {}')

    const result = await moveLocalFileTreeEntries(root, [filePath, srcPath], docsPath)

    expect(result).toEqual({ ok: true, message: '' })
    expect(existsSync(filePath)).toBe(false)
    expect(existsSync(srcPath)).toBe(false)
    await expect(readFile(join(docsPath, 'README.md'), 'utf8')).resolves.toBe('hello')
    await expect(readFile(join(docsPath, 'src', 'index.ts'), 'utf8')).resolves.toBe('export {}')
  })

  test('rejects target conflicts before moving anything', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-move-'))
    const docsPath = join(root, 'docs')
    const filePath = join(root, 'README.md')
    await mkdir(docsPath)
    await writeFile(filePath, 'hello')
    await writeFile(join(docsPath, 'README.md'), 'existing')

    const result = await moveLocalFileTreeEntries(root, [filePath], docsPath)

    expect(result).toEqual({ ok: false, message: 'error.file-exists' })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('hello')
    await expect(readFile(join(docsPath, 'README.md'), 'utf8')).resolves.toBe('existing')
  })

  test('rejects moving a directory into itself or a descendant', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-move-'))
    const srcPath = join(root, 'src')
    const nestedPath = join(srcPath, 'nested')
    await mkdir(nestedPath, { recursive: true })

    const result = await moveLocalFileTreeEntries(root, [srcPath], nestedPath)

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(existsSync(srcPath)).toBe(true)
    expect(existsSync(nestedPath)).toBe(true)
  })

  test('rejects worktree root move', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-file-tree-move-'))
    const docsPath = join(root, 'docs')
    await mkdir(docsPath)

    await expect(moveLocalFileTreeEntries(root, [root], docsPath)).resolves.toEqual({
      ok: false,
      message: 'error.delete-root-forbidden',
    })
  })
})
