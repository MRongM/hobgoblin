import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getWorktreeCommitMessageContext } from '#/system/git/commit-message-context.ts'
import { git } from '#/system/git/helper.ts'

let tempRepoPath: string | null = null

afterEach(() => {
  if (tempRepoPath) rmSync(tempRepoPath, { recursive: true, force: true })
  tempRepoPath = null
})

describe('getWorktreeCommitMessageContext integration', () => {
  test('collects the working tree state before the first commit', async () => {
    tempRepoPath = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-commit-context-'))
    await git(tempRepoPath, ['init', '--quiet'])

    const stagedPath = path.join(tempRepoPath, 'staged.txt')
    writeFileSync(stagedPath, 'staged version\n')
    await git(tempRepoPath, ['add', '--', 'staged.txt'])
    writeFileSync(stagedPath, 'working tree version\n')
    writeFileSync(path.join(tempRepoPath, 'untracked.txt'), 'untracked note\n')

    const context = await getWorktreeCommitMessageContext(tempRepoPath)

    expect(context.status).toEqual(['AM staged.txt', '?? untracked.txt'])
    expect(context.stat).toContain('staged.txt')
    expect(context.diff).toContain('+working tree version')
    expect(context.untracked).toContain('untracked note')
  })
})
