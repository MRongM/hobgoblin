import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resetHardToCurrentHead } from '#/system/git/reset.ts'

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

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo/worktree', { signal }, 'reset', '--hard',
    )
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
