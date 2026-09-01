import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getWorkingStatus, getWorktreeStatusEntries } from '#/system/git/status.ts'

const gitMock = vi.hoisted(() => vi.fn())
const scheduleGitStatusReadMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return { ...actual, git: gitMock }
})

vi.mock('#/system/git/concurrency.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/concurrency.ts')>('#/system/git/concurrency.ts')
  return { ...actual, scheduleGitStatusRead: scheduleGitStatusReadMock }
})

describe('Git working status reads', () => {
  beforeEach(() => {
    gitMock.mockReset()
    scheduleGitStatusReadMock.mockReset()
    scheduleGitStatusReadMock.mockImplementation((task: () => Promise<unknown>) => task())
  })

  test('schedules a direct single-worktree status command', async () => {
    gitMock.mockResolvedValue(' M src/app.ts\0')

    await expect(getWorktreeStatusEntries('C:\\repo')).resolves.toEqual([{ x: ' ', y: 'M', path: 'src/app.ts' }])

    expect(scheduleGitStatusReadMock).toHaveBeenCalledOnce()
    expect(gitMock).toHaveBeenCalledWith('C:\\repo', ['status', '--porcelain', '-z'], { signal: undefined })
  })

  test('schedules the worktree list and every non-bare worktree status command', async () => {
    gitMock
      .mockResolvedValueOnce(
        [
          'worktree C:/repo',
          'HEAD aaaaaaa',
          'branch refs/heads/main',
          '',
          'worktree C:/repo-feature',
          'HEAD bbbbbbb',
          'branch refs/heads/feature/test',
          '',
          'worktree C:/repo-bare',
          'bare',
          '',
        ].join('\n'),
      )
      .mockResolvedValueOnce(' M src/main.ts\0')
      .mockResolvedValueOnce('?? scratch.txt\0')

    const status = await getWorkingStatus('C:\\repo')

    expect(status).toHaveLength(2)
    expect(scheduleGitStatusReadMock).toHaveBeenCalledTimes(3)
    expect(gitMock).toHaveBeenCalledTimes(3)
    expect(gitMock).toHaveBeenCalledWith('C:/repo', ['status', '--porcelain', '-z'], { signal: undefined })
    expect(gitMock).toHaveBeenCalledWith('C:/repo-feature', ['status', '--porcelain', '-z'], {
      signal: undefined,
    })
  })
})
