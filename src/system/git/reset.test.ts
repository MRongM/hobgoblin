import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as resetOperations from '#/system/git/reset.ts'
import { discardChangesForPaths, resetHardToCurrentHead } from '#/system/git/reset.ts'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})

describe('resetHardToCurrentHead', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'HEAD is now at abc1234 current commit' })
  })

  test('calls git reset --hard with correct cwd', async () => {
    const signal = new AbortController().signal
    await resetHardToCurrentHead('/repo/worktree', signal)

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith('/repo/worktree', { signal }, 'reset', '--hard')
  })

  test('passes through success result', async () => {
    const result = await resetHardToCurrentHead('/repo/worktree')
    expect(result).toEqual({ ok: true, message: 'HEAD is now at abc1234 current commit' })
  })

  test('passes through git error', async () => {
    gitResultWithOptionsMock.mockResolvedValue({ ok: false, message: 'fatal: ambiguous argument' })
    const result = await resetHardToCurrentHead('/repo/worktree')
    expect(result).toEqual({ ok: false, message: 'fatal: ambiguous argument' })
  })
})

describe('alignWorktreeToRemoteRef', () => {
  const target = {
    branch: 'main',
    expectedHead: '1111111111111111111111111111111111111111',
    remoteRef: 'origin/main',
    remoteHead: '2222222222222222222222222222222222222222',
    expectedFingerprint: `sha256:${'3'.repeat(64)}`,
  }

  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: '' })
  })

  test('resets directly to the confirmed remote oid and removes non-ignored files', async () => {
    const alignWorktreeToRemoteRef = Reflect.get(resetOperations, 'alignWorktreeToRemoteRef') as unknown
    expect(alignWorktreeToRemoteRef).toBeTypeOf('function')
    if (typeof alignWorktreeToRemoteRef !== 'function') return
    const signal = new AbortController().signal
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'HEAD is now aligned' })
      .mockResolvedValueOnce({ ok: true, message: '' })

    const result = await alignWorktreeToRemoteRef('/repo/worktree', target, signal)

    expect(result).toEqual({ ok: true, message: '' })
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      1,
      '/repo/worktree',
      { signal: undefined },
      'reset',
      '--hard',
      target.remoteHead,
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(2, '/repo/worktree', { signal: undefined }, 'clean', '-fd')
  })

  test('forces the confirmed remote head without rechecking the checked-out branch', async () => {
    const alignWorktreeToRemoteRef = Reflect.get(resetOperations, 'alignWorktreeToRemoteRef') as unknown
    expect(alignWorktreeToRemoteRef).toBeTypeOf('function')
    if (typeof alignWorktreeToRemoteRef !== 'function') return
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'HEAD is now aligned' })
      .mockResolvedValueOnce({ ok: true, message: '' })

    await expect(alignWorktreeToRemoteRef('/repo/worktree', target)).resolves.toEqual({ ok: true, message: '' })
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      1,
      '/repo/worktree',
      { signal: undefined },
      'reset',
      '--hard',
      target.remoteHead,
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(2, '/repo/worktree', { signal: undefined }, 'clean', '-fd')
  })

  test('does not clean when the non-interruptible reset fails', async () => {
    const alignWorktreeToRemoteRef = Reflect.get(resetOperations, 'alignWorktreeToRemoteRef') as unknown
    expect(alignWorktreeToRemoteRef).toBeTypeOf('function')
    if (typeof alignWorktreeToRemoteRef !== 'function') return
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: false, message: 'fatal: reset failed' })

    await expect(alignWorktreeToRemoteRef('/repo/worktree', target)).resolves.toEqual({
      ok: false,
      message: 'fatal: reset failed',
      repoChanged: true,
    })
    expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(1)
  })

  test('marks reset-success clean-failure as requiring a fresh confirmation', async () => {
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'HEAD is now aligned' })
      .mockResolvedValueOnce({ ok: false, message: 'permission denied' })

    await expect(resetOperations.alignWorktreeToRemoteRef('/repo/worktree', target)).resolves.toEqual({
      ok: false,
      message: 'error.align-remote-clean-incomplete',
      repoChanged: true,
    })
  })
})

describe('discardChangesForPaths', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: '' })
  })

  test('restores tracked changes then cleans all selected paths', async () => {
    const signal = new AbortController().signal
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'src/app.ts\ndocs/readme.md' })
      .mockResolvedValueOnce({ ok: true, message: '' })

    const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts', 'docs'], signal)

    expect(result).toEqual({ ok: true, message: '' })
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      1,
      '/repo/worktree',
      { signal },
      'ls-files',
      '--',
      'src/app.ts',
      'docs',
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      2,
      '/repo/worktree',
      { signal },
      'restore',
      '--staged',
      '--worktree',
      '--source=HEAD',
      '--',
      'src/app.ts',
      'docs',
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      3,
      '/repo/worktree',
      { signal },
      'clean',
      '-fd',
      '--',
      'src/app.ts',
      'docs',
    )
  })

  test('restores only tracked pathspec matches before cleaning every selected path', async () => {
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'src/app.ts' })
      .mockResolvedValueOnce({ ok: true, message: '' })

    const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts', 'scratch/new.txt'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      2,
      '/repo/worktree',
      { signal: undefined },
      'restore',
      '--staged',
      '--worktree',
      '--source=HEAD',
      '--',
      'src/app.ts',
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      3,
      '/repo/worktree',
      { signal: undefined },
      'clean',
      '-fd',
      '--',
      'src/app.ts',
      'scratch/new.txt',
    )
  })

  test('cleans untracked-only paths without calling restore', async () => {
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: '' })
      .mockResolvedValueOnce({ ok: true, message: 'Removing scratch/new.txt' })

    const result = await discardChangesForPaths('/repo/worktree', ['scratch/new.txt'])

    expect(result).toEqual({ ok: true, message: 'Removing scratch/new.txt' })
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      1,
      '/repo/worktree',
      { signal: undefined },
      'ls-files',
      '--',
      'scratch/new.txt',
    )
    expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
      2,
      '/repo/worktree',
      { signal: undefined },
      'clean',
      '-fd',
      '--',
      'scratch/new.txt',
    )
  })

  test('does not clean when restore fails', async () => {
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'src/app.ts' })
      .mockResolvedValueOnce({ ok: false, message: 'fatal: restore failed' })

    const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts'])

    expect(result).toEqual({ ok: false, message: 'fatal: restore failed' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(2)
  })

  test('returns clean failure after restore succeeds', async () => {
    gitResultWithOptionsMock
      .mockResolvedValueOnce({ ok: true, message: 'src/app.ts' })
      .mockResolvedValueOnce({ ok: true, message: '' })
      .mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })

    const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts'])

    expect(result).toEqual({ ok: false, message: 'fatal: clean failed' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(3)
  })

  test('returns ls-files failure without changing paths', async () => {
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'fatal: not a git repository' })

    const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts'])

    expect(result).toEqual({ ok: false, message: 'fatal: not a git repository' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(1)
  })
})
