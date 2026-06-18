import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  git: vi.fn(),
  lstat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('#/system/git/helper.ts', () => ({
  git: mocks.git,
}))

vi.mock('node:fs/promises', () => ({
  lstat: mocks.lstat,
  readFile: mocks.readFile,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.lstat.mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 20,
  })
  mocks.readFile.mockResolvedValue(Buffer.from('untracked note\n', 'utf8'))
})

describe('getWorktreeCommitMessageContext', () => {
  test('collects status, stat, tracked diff, and small untracked text content', async () => {
    mocks.git
      .mockResolvedValueOnce(' M src/app.ts\0?? notes.txt\0')
      .mockResolvedValueOnce(' src/app.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)')
      .mockResolvedValueOnce('diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new')

    const { getWorktreeCommitMessageContext, formatCommitMessageContext, isEmptyCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(isEmptyCommitMessageContext(context)).toBe(false)
    expect(context.status).toEqual([' M src/app.ts', '?? notes.txt'])
    expect(context.stat).toContain('src/app.ts | 2 +-')
    expect(context.diff).toContain('+new')
    expect(context.untracked).toContain('--- notes.txt')
    expect(context.untracked).toContain('untracked note')
    expect(context.omitted).toEqual([])
    expect(context.truncated).toBe(false)
    expect(formatCommitMessageContext(context)).toContain('Changed files:')
    expect(formatCommitMessageContext(context)).toContain('Untracked file excerpts:')
  })

  test('omits binary and oversized untracked files without reading oversized content', async () => {
    mocks.git
      .mockResolvedValueOnce('?? assets/icon.png\0?? fixtures/large.json\0')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
    mocks.lstat
      .mockResolvedValueOnce({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 10,
      })
      .mockResolvedValueOnce({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 40_000,
      })
    mocks.readFile.mockResolvedValueOnce(Buffer.from([0, 1, 2, 3]))

    const { getWorktreeCommitMessageContext } = await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.untracked).toBe('')
    expect(context.omitted).toContain('binary untracked file omitted: assets/icon.png')
    expect(context.omitted).toContain('oversized untracked file omitted: fixtures/large.json')
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  test('caps tracked diff and records a truncation marker', async () => {
    mocks.git
      .mockResolvedValueOnce(' M src/large.ts\0')
      .mockResolvedValueOnce(' src/large.ts | 9000 +++++++++++++++++++++++++++++++++')
      .mockResolvedValueOnce(`diff --git a/src/large.ts b/src/large.ts\n${'+x\n'.repeat(30_000)}`)

    const { getWorktreeCommitMessageContext, formatCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.truncated).toBe(true)
    expect(context.diff.length).toBeLessThanOrEqual(40_050)
    expect(formatCommitMessageContext(context)).toContain('[tracked diff truncated]')
  })

  test('caps untracked file excerpts and summarizes skipped files', async () => {
    const status = Array.from({ length: 12 }, (_value, index) => `?? file-${index}.txt`).join('\0') + '\0'
    mocks.git.mockResolvedValueOnce(status).mockResolvedValueOnce('').mockResolvedValueOnce('')
    mocks.readFile.mockImplementation(async (filePath: string) => Buffer.from(`content for ${filePath}\n`, 'utf8'))

    const { getWorktreeCommitMessageContext } = await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(context.untracked).toContain('file-0.txt')
    expect(context.untracked).toContain('file-9.txt')
    expect(context.untracked).not.toContain('file-10.txt')
    expect(context.omitted).toContain('2 untracked files omitted after limit 10')
  })

  test('caps inspected untracked files even when earlier files are omitted', async () => {
    const status = Array.from({ length: 12 }, (_value, index) => `?? asset-${index}.png`).join('\0') + '\0'
    mocks.git.mockResolvedValueOnce(status).mockResolvedValueOnce('').mockResolvedValueOnce('')
    mocks.lstat.mockResolvedValue({
      isFile: () => true,
      isSymbolicLink: () => false,
      size: 40_000,
    })

    const { getWorktreeCommitMessageContext } = await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(mocks.lstat).toHaveBeenCalledTimes(10)
    expect(context.omitted).toContain('oversized untracked file omitted: asset-0.png')
    expect(context.omitted).toContain('2 untracked files omitted after limit 10')
  })

  test('reports empty context when status, stat, diff, and untracked excerpts are empty', async () => {
    mocks.git.mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('')

    const { getWorktreeCommitMessageContext, isEmptyCommitMessageContext } =
      await import('#/system/git/commit-message-context.ts')

    const context = await getWorktreeCommitMessageContext('/repo/worktree')

    expect(isEmptyCommitMessageContext(context)).toBe(true)
  })
})
