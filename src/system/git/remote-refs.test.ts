import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getRemoteTags,
  getRemoteTrackingBranchInfo,
  getRemoteTrackingBranches,
} from '#/system/git/remote-refs.ts'

const gitMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', () => ({
  git: gitMock,
}))

describe('getRemoteTrackingBranches', () => {
  beforeEach(() => {
    gitMock.mockReset()
  })

  test('reads and filters remote-tracking refs', async () => {
    const signal = new AbortController().signal
    gitMock.mockResolvedValue('origin/HEAD\norigin/main\norigin/feature/a\n')

    await expect(getRemoteTrackingBranches('/repo', signal)).resolves.toEqual(['origin/main', 'origin/feature/a'])
    expect(gitMock).toHaveBeenCalledWith('/repo', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/'], {
      signal,
    })
  })

  test('reads remote-tracking refs with their current object ids', async () => {
    const signal = new AbortController().signal
    const mainHead = 'a'.repeat(40)
    const releaseHead = 'b'.repeat(64)
    gitMock.mockResolvedValue(
      [`upstream/release/v2\0${releaseHead}`, `origin/main\0${mainHead}`, `origin/HEAD\0${mainHead}`].join('\n'),
    )

    await expect(getRemoteTrackingBranchInfo('/repo', signal)).resolves.toEqual([
      { remoteRef: 'origin/main', head: mainHead },
      { remoteRef: 'upstream/release/v2', head: releaseHead },
    ])
    expect(gitMock).toHaveBeenCalledWith(
      '/repo',
      ['for-each-ref', '--format=%(refname:short)%00%(objectname)', 'refs/remotes/'],
      { signal },
    )
  })

  test('reads remote tags from each configured remote', async () => {
    const signal = new AbortController().signal
    gitMock.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === 'remote' && args[1] === '-v') {
        return [
          'origin\thttps://example.com/acme/repo.git (fetch)',
          'origin\thttps://example.com/acme/repo.git (push)',
          'upstream\thttps://example.com/acme/upstream.git (fetch)',
          'upstream\thttps://example.com/acme/upstream.git (push)',
        ].join('\n')
      }
      if (args[0] === 'ls-remote' && args[3] === 'origin') {
        return 'abc123\trefs/tags/v1.0.0\ndef456\trefs/tags/release/1.0\n'
      }
      if (args[0] === 'ls-remote' && args[3] === 'upstream') {
        return 'abc123\trefs/tags/v1.0.0\nbad\trefs/heads/main\n'
      }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(getRemoteTags('/repo', signal)).resolves.toEqual([
      'origin/release/1.0',
      'origin/v1.0.0',
      'upstream/v1.0.0',
    ])
    expect(gitMock).toHaveBeenCalledWith('/repo', ['ls-remote', '--tags', '--refs', 'origin'], { signal })
    expect(gitMock).toHaveBeenCalledWith('/repo', ['ls-remote', '--tags', '--refs', 'upstream'], { signal })
  })
})
