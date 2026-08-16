import { beforeEach, describe, expect, test, vi } from 'vitest'
import { FIELD_SEP } from '#/system/git/parsers.ts'

const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', () => ({
  git: gitMock,
}))

describe('git history helpers', () => {
  beforeEach(() => {
    gitMock.mockReset()
  })

  test('reads branch history with normalized pagination', async () => {
    gitMock.mockResolvedValue(['abc123456789', 'abc1234', 'feat: history', 'Alice', '2026-06-15T09:00:00+08:00', 'def456'].join(FIELD_SEP))

    const { getCommitHistory } = await import('#/system/git/history.ts')
    await expect(getCommitHistory('/repo', 'feature/history', { limit: 500, skip: -5 })).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: history',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: ['def456'],
      },
    ])

    expect(gitMock).toHaveBeenCalledWith(
      '/repo',
      [
        'log',
        `--format=${['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)}`,
        '--max-count=200',
        '--skip=0',
        'feature/history',
        '--',
      ],
      { signal: undefined },
    )
  })

  test('rejects invalid branch before running git', async () => {
    const { getCommitHistory } = await import('#/system/git/history.ts')

    await expect(getCommitHistory('/repo', '-bad', { limit: 100, skip: 0 })).resolves.toEqual([])
    expect(gitMock).not.toHaveBeenCalled()
  })

  test('reads commit detail metadata and file stats', async () => {
    gitMock
      .mockResolvedValueOnce(['abc123456789', 'abc1234', 'feat: detail', 'Alice', '2026-06-15T09:00:00+08:00', 'def456'].join(FIELD_SEP))
      .mockResolvedValueOnce(['M', 'src/app.ts'].join('\0') + '\0')
      .mockResolvedValueOnce('3\t1\tsrc/app.ts\0')

    const { getCommitDetail } = await import('#/system/git/history.ts')
    await expect(getCommitDetail('/repo', 'abc1234')).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: detail',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
      files: [{ path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 }],
    })

    expect(gitMock).toHaveBeenNthCalledWith(
      1,
      '/repo',
      ['show', '-s', `--format=${['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)}`, 'abc1234'],
      { signal: undefined },
    )
    expect(gitMock).toHaveBeenNthCalledWith(
      2,
      '/repo',
      ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-C', '--root', '-z', 'abc1234'],
      { signal: undefined },
    )
    expect(gitMock).toHaveBeenNthCalledWith(
      3,
      '/repo',
      ['diff-tree', '--no-commit-id', '--numstat', '-r', '-M', '-C', '--root', '-z', 'abc1234'],
      { signal: undefined },
    )
  })

  test('rejects invalid commit before running git', async () => {
    const { getCommitDetail } = await import('#/system/git/history.ts')

    await expect(getCommitDetail('/repo', 'not-a-hash')).resolves.toBeNull()
    expect(gitMock).not.toHaveBeenCalled()
  })
})
