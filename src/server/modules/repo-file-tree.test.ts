import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getRepositoryFileTree, searchRepositoryFileTree } from '#/server/modules/repo-file-tree.ts'

describe('getRepositoryFileTree', () => {
  test('returns local directory entries for a local repo id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-repo-file-tree-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'README.md'), '')

    const result = await getRepositoryFileTree(root, root, root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((entry) => entry.relativePath)).toEqual(['src', 'README.md'])
  })

  test('rejects local dirPath outside worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-repo-file-tree-'))
    const result = await getRepositoryFileTree(root, root, tmpdir())
    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
  })

  test('searches local repository file tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'goblin-repo-file-search-'))
    const result = await searchRepositoryFileTree(root, root, 'readme', 10)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBeTruthy()
  })
})
