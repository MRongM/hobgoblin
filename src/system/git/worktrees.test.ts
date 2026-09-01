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
const scheduleGitStatusReadMock = vi.hoisted(() => vi.fn())

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

vi.mock('#/system/git/concurrency.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/concurrency.ts')>('#/system/git/concurrency.ts')
  return { ...actual, scheduleGitStatusRead: scheduleGitStatusReadMock }
})

describe('worktree git operations', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitMock.mockResolvedValue('')
    scheduleGitStatusReadMock.mockReset()
    scheduleGitStatusReadMock.mockImplementation((task: () => Promise<unknown>) => task())
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: false, message: 'cancelled' })
  })

  test('requests immediate expiry annotations when listing worktrees', async () => {
    const signal = new AbortController().signal

    await getWorktrees('/tmp/repo', { includeStatus: false, signal })

    expect(gitMock).toHaveBeenCalledWith('/tmp/repo', ['worktree', 'list', '--porcelain', '--expire', 'now'], {
      signal,
    })
    expect(scheduleGitStatusReadMock).not.toHaveBeenCalled()
  })

  test('schedules the worktree list and statuses for a status-inclusive snapshot', async () => {
    gitMock
      .mockResolvedValueOnce('worktree /tmp/repo\nHEAD aaaaaaa\nbranch refs/heads/main\n')
      .mockResolvedValueOnce(' M src/app.ts\0')

    await expect(getWorktrees('/tmp/repo')).resolves.toMatchObject([
      { path: '/tmp/repo', isDirty: true, changeCount: 1 },
    ])

    expect(scheduleGitStatusReadMock).toHaveBeenCalledTimes(2)
    expect(gitMock).toHaveBeenCalledTimes(2)
  })

  test.each([
    [
      'newBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch' as const,
          newBranch: 'feature/branch',
          creationBase: { kind: 'localBranch' as const, branch: 'main' },
        },
        syncBeforeCreate: false,
      },
      ['worktree', 'add', '--relative-paths', '-b', 'feature/branch', '--', '/tmp/repo-feature', 'main'],
    ],
    [
      'existingBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch' as const, branch: 'feature/branch' },
        syncBeforeCreate: false,
      },
      ['worktree', 'add', '--relative-paths', '--', '/tmp/repo-feature', 'feature/branch'],
    ],
    [
      'trackRemoteBranch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'trackRemoteBranch' as const, remoteRef: 'origin/feature/branch', localBranch: 'feature/branch' },
        syncBeforeCreate: false,
      },
      [
        'worktree',
        'add',
        '--relative-paths',
        '-b',
        'feature/branch',
        '--track',
        '--',
        '/tmp/repo-feature',
        'origin/feature/branch',
      ],
    ],
    [
      'detached',
      {
        worktreePath: '/tmp/repo-detached',
        mode: { kind: 'detached' as const, ref: 'origin/feature/branch' },
        syncBeforeCreate: false,
      },
      ['worktree', 'add', '--relative-paths', '--detach', '--', '/tmp/repo-detached', 'origin/feature/branch'],
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

  test('falls back to absolute worktree links when Git predates relative worktree support', async () => {
    const input = {
      worktreePath: '/tmp/repo-feature',
      mode: { kind: 'existingBranch' as const, branch: 'feature/branch' },
      syncBeforeCreate: false,
    }
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: false, message: "error: unknown option `relative-paths'" })
      .mockResolvedValueOnce({ ok: true, message: 'created' })

    await expect(createWorktree('/tmp/repo', input)).resolves.toEqual({ ok: true, message: 'created' })

    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      2,
      '/tmp/repo',
      { timeoutMs: 180_000, signal: undefined },
      'worktree',
      'add',
      '--',
      '/tmp/repo-feature',
      'feature/branch',
    )
  })

  test.each([
    [
      'new branch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'newBranch' as const,
          newBranch: 'feature/branch',
          creationBase: { kind: 'remoteBranch' as const, remoteRef: 'origin/main' },
        },
        syncBeforeCreate: false,
      },
      'feature/branch',
      'origin/main',
    ],
    [
      'remote-tracking branch',
      {
        worktreePath: '/tmp/repo-feature',
        mode: {
          kind: 'trackRemoteBranch' as const,
          remoteRef: 'origin/feature/branch',
          localBranch: 'feature/branch',
        },
        syncBeforeCreate: false,
      },
      'feature/branch',
      'origin/feature/branch',
    ],
  ])('records the selected source after creating a %s worktree', async (_name, input, branch, createdFrom) => {
    const signal = new AbortController().signal
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: true, message: 'created' })

    await expect(createWorktree('/tmp/repo', input, signal)).resolves.toEqual({ ok: true, message: 'created' })

    expect(gitMock).toHaveBeenCalledWith(
      '/tmp/repo',
      ['config', '--local', `branch.${branch}.hobgoblin-created-from`, createdFrom],
      { signal },
    )
  })

  test.each([
    {
      worktreePath: '/tmp/repo-feature',
      mode: { kind: 'existingBranch' as const, branch: 'feature/branch' },
      syncBeforeCreate: false,
    },
    {
      worktreePath: '/tmp/repo-detached',
      mode: { kind: 'detached' as const, ref: 'origin/feature/branch' },
      syncBeforeCreate: false,
    },
  ])('does not record a source when worktree creation does not create a branch', async (input) => {
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: true, message: 'created' })

    await createWorktree('/tmp/repo', input)

    expect(gitMock).not.toHaveBeenCalled()
  })

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
