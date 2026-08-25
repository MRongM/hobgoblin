import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { git } from '#/system/git/helper.ts'
import { getWorktreeContentState } from '#/system/git/worktree-content-state.ts'

const temporaryDirectories: string[] = []

async function createRepository(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hobgoblin-content-state-test-'))
  temporaryDirectories.push(cwd)
  await git(cwd, ['init'])
  await git(cwd, ['config', 'user.name', 'Test User'])
  await git(cwd, ['config', 'user.email', 'test@example.invalid'])
  await fs.writeFile(path.join(cwd, '.gitignore'), 'ignored.txt\n')
  await fs.writeFile(path.join(cwd, 'tracked.txt'), 'initial\n')
  await git(cwd, ['add', '.gitignore', 'tracked.txt'])
  await git(cwd, ['commit', '-m', 'initial'])
  return cwd
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('getWorktreeContentState', () => {
  test('tracks index, tracked and untracked content while ignoring ignored files', async () => {
    const cwd = await createRepository()
    await fs.writeFile(path.join(cwd, 'untracked.txt'), 'untracked\n')
    await fs.writeFile(path.join(cwd, 'ignored.txt'), 'ignored one\n')
    const original = await getWorktreeContentState(cwd)
    expect(original).not.toBeNull()
    if (!original) return

    await fs.writeFile(path.join(cwd, 'tracked.txt'), 'working copy changed\n')
    const workingCopyChanged = await getWorktreeContentState(cwd)
    expect(workingCopyChanged).not.toBeNull()
    if (!workingCopyChanged) return
    expect(workingCopyChanged.indexHash).toBe(original.indexHash)
    expect(workingCopyChanged.worktreeTree).not.toBe(original.worktreeTree)

    await fs.writeFile(path.join(cwd, 'ignored.txt'), 'ignored two\n')
    await expect(getWorktreeContentState(cwd)).resolves.toEqual(workingCopyChanged)

    await git(cwd, ['add', 'tracked.txt'])
    const staged = await getWorktreeContentState(cwd)
    expect(staged).not.toBeNull()
    expect(staged?.indexHash).not.toBe(workingCopyChanged.indexHash)
    expect(staged?.worktreeTree).toBe(workingCopyChanged.worktreeTree)

    await fs.writeFile(path.join(cwd, 'untracked.txt'), 'untracked changed\n')
    const untrackedChanged = await getWorktreeContentState(cwd)
    expect(untrackedChanged?.worktreeTree).not.toBe(staged?.worktreeTree)
  }, 15_000)
})
