import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as branchOperations from '#/system/git/branches.ts'
import type { BranchSnapshotInfo } from '#/shared/git-types.ts'

const { createBranch, createTrackingBranch, deleteRemoteServerBranch } = branchOperations

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
