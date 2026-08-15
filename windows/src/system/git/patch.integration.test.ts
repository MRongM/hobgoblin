import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from '#/system/git/helper.ts'
import { getWorktreePatch } from '#/system/git/patch.ts'

let tempRepoPath: string | null = null

afterEach(() => {
  if (tempRepoPath) rmSync(tempRepoPath, { recursive: true, force: true })
  tempRepoPath = null
})

describe('getWorktreePatch integration', () => {
  test('builds a patch before the first commit', async () => {
    tempRepoPath = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-patch-'))
    await git(tempRepoPath, ['init', '--quiet'])

    const stagedPath = path.join(tempRepoPath, 'staged.txt')
    writeFileSync(stagedPath, 'staged version\n')
    await git(tempRepoPath, ['add', '--', 'staged.txt'])
    writeFileSync(stagedPath, 'working tree version\n')
    writeFileSync(path.join(tempRepoPath, 'untracked.txt'), 'untracked note\n')

    const patch = await getWorktreePatch(tempRepoPath)

    expect(patch).toContain('diff --git a/staged.txt b/staged.txt')
    expect(patch).toContain('+working tree version')
    expect(patch).toContain('diff --git a/untracked.txt b/untracked.txt')
    expect(patch).toContain('+untracked note')
  })
})
