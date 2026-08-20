import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as branchOperations from '#/system/git/branches.ts'
import type { BranchSnapshotInfo } from '#/shared/git-types.ts'

const { createBranch, createTrackingBranch, deleteRemoteServerBranch } = branchOperations

async function checkoutTrackingBranch(cwd: string, localBranch: string, remoteRef: string, signal?: AbortSignal) {
  const checkout = (branchOperations as Record<string, unknown>).checkoutTrackingBranch
  expect(checkout).toBeTypeOf('function')
  return await (
    checkout as (cwd: string, localBranch: string, remoteRef: string, signal?: AbortSignal) => Promise<unknown>
  )(cwd, localBranch, remoteRef, signal)
}

async function setBranchUpstream(
  cwd: string,
  branch: string,
  remoteRef: string | null,
  signal?: AbortSignal,
) {
  const setUpstream = (branchOperations as Record<string, unknown>).setBranchUpstream
  expect(setUpstream).toBeTypeOf('function')
  return await (
    setUpstream as (
      cwd: string,
      branch: string,
      remoteRef: string | null,
      signal?: AbortSignal,
    ) => Promise<unknown>
  )(cwd, branch, remoteRef, signal)
}

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: gitMock,
    gitResultWithOptions: gitResultWithOptionsMock,
  }
})

function branch(name: string): BranchSnapshotInfo {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: '',
    lastCommitMessage: '',
    lastCommitDate: '',
    lastCommitAuthor: '',
  }
}

function parseBranchCreatedFromConfig(output: string): Map<string, string> {
  const parser = (branchOperations as Record<string, unknown>).parseBranchCreatedFromConfig
  expect(parser).toBeTypeOf('function')
  return (parser as (value: string) => Map<string, string>)(output)
}

function markBranchCreatedFrom(
  branches: BranchSnapshotInfo[],
  sources: ReadonlyMap<string, string>,
): BranchSnapshotInfo[] {
  const marker = (branchOperations as Record<string, unknown>).markBranchCreatedFrom
  expect(marker).toBeTypeOf('function')
  return (marker as (items: BranchSnapshotInfo[], values: ReadonlyMap<string, string>) => BranchSnapshotInfo[])(
    branches,
    sources,
  )
}

describe('branch creation source metadata', () => {
  test('parses and projects validated branch creation sources', () => {
    const sources = parseBranchCreatedFromConfig(
      [
        'branch.feature/a.hobgoblin-created-from main',
        'branch.feature/b.hobgoblin-created-from origin/develop',
        'branch.-bad.hobgoblin-created-from main',
        'branch.feature/unsafe.hobgoblin-created-from -bad',
        'branch.feature/empty.hobgoblin-created-from ',
        'remote.origin.url example.invalid',
        'malformed',
      ].join('\n'),
    )

    expect([...sources]).toEqual([
      ['feature/a', 'main'],
      ['feature/b', 'origin/develop'],
    ])
    expect(markBranchCreatedFrom([branch('feature/a'), branch('feature/c')], sources)).toEqual([
      { ...branch('feature/a'), createdFrom: 'main' },
      branch('feature/c'),
    ])
  })

  test('projects recorded creation sources into the local branch snapshot', async () => {
    gitMock.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === 'for-each-ref') {
        return ['feature/a', 'abc1234', 'feature', '2026-01-01T00:00:00Z', 'Test', '', ''].join('\x1f')
      }
      if (args[0] === 'symbolic-ref' && args[2] === 'HEAD') return 'feature/a'
      if (args[0] === 'symbolic-ref') return 'origin/main'
      if (args[0] === 'config') return 'branch.feature/a.hobgoblin-created-from main'
      return ''
    })

    await expect(branchOperations.getBranches('/repo')).resolves.toMatchObject([
      { name: 'feature/a', createdFrom: 'main' },
    ])
  })
})

describe('branch creation helpers', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitMock.mockResolvedValue('')
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'ok' })
  })

  test('creates a branch from a local base branch', async () => {
    const signal = new AbortController().signal

    await expect(createBranch('/repo', 'feature/new', 'main', signal)).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--',
      'feature/new',
      'main',
    )
    expect(gitMock).toHaveBeenCalledWith(
      '/repo',
      ['config', '--local', 'branch.feature/new.hobgoblin-created-from', 'main'],
      { signal },
    )
  })

  test('creates a local tracking branch from a remote ref', async () => {
    const signal = new AbortController().signal

    await expect(createTrackingBranch('/repo', 'feature/new', 'origin/feature/new', signal)).resolves.toEqual({
      ok: true,
      message: 'ok',
    })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--track',
      '--',
      'feature/new',
      'origin/feature/new',
    )
    expect(gitMock).toHaveBeenCalledWith(
      '/repo',
      ['config', '--local', 'branch.feature/new.hobgoblin-created-from', 'origin/feature/new'],
      { signal },
    )
  })

  test('creates and checks out a local tracking branch atomically', async () => {
    const signal = new AbortController().signal

    await expect(
      checkoutTrackingBranch('/repo-worktree', 'feature/new', 'origin/feature/new', signal),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo-worktree',
      { signal },
      'switch',
      '--track',
      '-c',
      'feature/new',
      '--',
      'origin/feature/new',
    )
    expect(gitMock).toHaveBeenCalledWith(
      '/repo-worktree',
      ['config', '--local', 'branch.feature/new.hobgoblin-created-from', 'origin/feature/new'],
      { signal },
    )
  })

  test('rejects invalid tracking checkout inputs before running git', async () => {
    await expect(checkoutTrackingBranch('/repo-worktree', '-bad', 'origin/feature/new')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(checkoutTrackingBranch('/repo-worktree', 'feature/new', 'origin/HEAD')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
    expect(gitMock).not.toHaveBeenCalled()
  })

  test('sets an existing local branch upstream to a remote ref', async () => {
    const signal = new AbortController().signal

    await expect(setBranchUpstream('/repo', 'feature/local', 'origin/release', signal)).resolves.toEqual({
      ok: true,
      message: 'ok',
    })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--set-upstream-to=origin/release',
      '--',
      'feature/local',
    )
  })

  test('removes an existing local branch upstream', async () => {
    const signal = new AbortController().signal

    await expect(setBranchUpstream('/repo', 'feature/local', null, signal)).resolves.toEqual({
      ok: true,
      message: 'ok',
    })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      { signal },
      'branch',
      '--unset-upstream',
      '--',
      'feature/local',
    )
  })

  test('rejects invalid upstream changes before running git', async () => {
    await expect(setBranchUpstream('/repo', '-bad', 'origin/release')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(setBranchUpstream('/repo', 'feature/local', 'origin/HEAD')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })

  test('keeps successful branch creation when source metadata cannot be recorded', async () => {
    gitMock.mockRejectedValueOnce(new Error('config is read-only'))

    await expect(createBranch('/repo', 'feature/new', 'main')).resolves.toEqual({ ok: true, message: 'ok' })
  })

  test('does not record source metadata when branch creation fails', async () => {
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'already exists' })

    await expect(createBranch('/repo', 'feature/new', 'main')).resolves.toEqual({
      ok: false,
      message: 'already exists',
    })

    expect(gitMock).not.toHaveBeenCalled()
  })

  test('rejects invalid branch inputs before running git', async () => {
    await expect(createBranch('/repo', '-bad', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(createTrackingBranch('/repo', 'feature/new', 'origin/HEAD')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })

  test('deletes a remote server branch with network options', async () => {
    const signal = new AbortController().signal

    await expect(
      deleteRemoteServerBranch('/repo', 'origin', 'feature/remove-me', signal, {
        timeoutMs: 120_000,
        proxyUrl: 'http://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      {
        timeoutMs: 120_000,
        signal,
        env: {
          HTTP_PROXY: 'http://127.0.0.1:7890',
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          http_proxy: 'http://127.0.0.1:7890',
          https_proxy: 'http://127.0.0.1:7890',
        },
      },
      'push',
      '--delete',
      '--',
      'origin',
      'feature/remove-me',
    )
  })

  test('rejects invalid and protected remote server branch delete inputs before running git', async () => {
    await expect(deleteRemoteServerBranch('/repo', 'origin', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(deleteRemoteServerBranch('/repo', 'bad/remote', 'feature/a')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })
})
