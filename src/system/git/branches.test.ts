import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createBranch, createTrackingBranch } from '#/system/git/branches.ts'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    gitResultWithOptions: gitResultWithOptionsMock,
  }
})

describe('branch creation helpers', () => {
  beforeEach(() => {
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
})
