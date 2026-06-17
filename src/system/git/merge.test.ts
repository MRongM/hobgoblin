import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mergeBranch } from '#/system/git/merge.ts'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: vi.fn((cwd: string, args: string[], opts: unknown) => gitMock(cwd, args, opts)),
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})

describe('mergeBranch', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: '' })
    gitMock.mockReset()
    gitMock.mockResolvedValue('')
  })

  test('calls git merge -- <branch> with correct args', async () => {
    const signal = new AbortController().signal
    await mergeBranch('/repo/worktree', 'feature/x', signal)

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo/worktree', { signal }, 'merge', '--', 'feature/x',
    )
  })

  test('rejects unsafe branch names before calling git', async () => {
    const result = await mergeBranch('/repo/worktree', '../evil')
    expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })

  test('passes through git error on conflict', async () => {
    gitResultWithOptionsMock.mockResolvedValue({ ok: false, message: 'CONFLICT (content)' })
    const result = await mergeBranch('/repo/worktree', 'main')
    expect(result).toEqual({ ok: false, message: 'CONFLICT (content)' })
  })

  test('marks failed merge as merge-conflict when status has unmerged entries', async () => {
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'CONFLICT (content)' })
    gitMock.mockResolvedValueOnce('UU src/app.ts\0')

    const result = await mergeBranch('/repo/worktree', 'main')

    expect(result).toEqual({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })
    expect(gitMock).toHaveBeenCalledWith('/repo/worktree', ['status', '--porcelain', '-z'], { signal: undefined })
  })

  test('does not mark failed merge as conflict when status has no unmerged entries', async () => {
    gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'fatal: not something we can merge' })
    gitMock.mockResolvedValueOnce(' M src/app.ts\0')

    const result = await mergeBranch('/repo/worktree', 'missing')

    expect(result).toEqual({ ok: false, message: 'fatal: not something we can merge' })
  })
})
