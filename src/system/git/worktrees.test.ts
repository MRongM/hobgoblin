import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as worktreeOperations from '#/system/git/worktrees.ts'

const { createWorktree, getWorktrees, removeWorktree } = worktreeOperations

function pruneWorktrees(cwd: string, options: { signal?: AbortSignal }) {
  const prune = (worktreeOperations as Record<string, unknown>).pruneWorktrees
  expect(prune).toBeTypeOf('function')
  return (prune as (repoPath: string, input: { signal?: AbortSignal }) => Promise<unknown>)(cwd, options)
}

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: gitMock,
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})

describe('worktree git operations', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitMock.mockResolvedValue('')
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: false, message: 'cancelled' })
  })

  test('requests immediate expiry annotations when listing worktrees', async () => {
    const signal = new AbortController().signal

    await getWorktrees('/tmp/repo', { includeStatus: false, signal })

    expect(gitMock).toHaveBeenCalledWith(
      '/tmp/repo',
      ['worktree', 'list', '--porcelain', '--expire', 'now'],
      { signal },
    )
  })

  test.each([
    [
      'newBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'newBranch' as const, newBranch: 'feature/branch', baseRef: 'main' },
      },
      ['worktree', 'add', '-b', 'feature/branch', '--', '/tmp/repo-feature', 'main'],
    ],
    [
      'existingBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch' as const, branch: 'feature/branch' },
      },
      ['worktree', 'add', '--', '/tmp/repo-feature', 'feature/branch'],
    ],
    [
      'trackRemoteBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'trackRemoteBranch' as const, remoteRef: 'origin/feature/branch', localBranch: 'feature/branch' },
      },
      ['worktree', 'add', '-b', 'feature/branch', '--track', '--', '/tmp/repo-feature', 'origin/feature/branch'],
    ],
    [
      'detached',
      {
        worktreePath: '/tmp/repo-detached',
        mode: { kind: 'detached' as const, ref: 'origin/feature/branch' },
      },
      ['worktree', 'add', '--detach', '--', '/tmp/repo-detached', 'origin/feature/branch'],
    ],
  ])(
    'delegates %s createWorktree to git worktree add with the shared timeout and signal',
    async (_name, input, expectedArgs) => {
      const signal = new AbortController().signal

      const result = await createWorktree('/tmp/repo', input, signal)

      expect(result).toEqual({ ok: false, message: 'cancelled' })
      expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
        '/tmp/repo',
        { timeoutMs: 180_000, signal },
        ...expectedArgs,
      )
    },
  )

  test('delegates removeWorktree to git worktree remove with the shared timeout and signal', async () => {
    const signal = new AbortController().signal

    const result = await removeWorktree('/tmp/repo', '/tmp/repo-feature', { signal })

    expect(result).toEqual({ ok: false, message: 'cancelled' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/tmp/repo',
      { timeoutMs: 180_000, signal },
      'worktree',
      'remove',
      '--',
      '/tmp/repo-feature',
    )
  })

  test('adds one force flag when removing a dirty worktree is explicitly approved', async () => {
    const signal = new AbortController().signal

    const result = await removeWorktree('/tmp/repo', '/tmp/repo-feature', { force: true, signal })

    expect(result).toEqual({ ok: false, message: 'cancelled' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/tmp/repo',
      { timeoutMs: 180_000, signal },
      'worktree',
      'remove',
      '--force',
      '--',
      '/tmp/repo-feature',
    )
  })

  test('prunes immediately expired worktree records with the shared timeout and signal', async () => {
    const signal = new AbortController().signal

    const result = await pruneWorktrees('/tmp/repo', { signal })

    expect(result).toEqual({ ok: false, message: 'cancelled' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/tmp/repo',
      { timeoutMs: 180_000, signal },
      'worktree',
      'prune',
      '--expire',
      'now',
    )
  })
})
