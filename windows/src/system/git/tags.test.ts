import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createLocalTag, deleteLocalTag, getLocalTags, pushLocalTag } from '#/system/git/tags.ts'

const gitMock = vi.hoisted(() => vi.fn())
const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())
const getRemotesMock = vi.hoisted(() => vi.fn())
const resolveFetchRemoteForRemotesMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: gitMock,
    gitResultWithOptions: gitResultWithOptionsMock,
  }
})

vi.mock('#/system/git/remote.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/remote.ts')>('#/system/git/remote.ts')
  return {
    ...actual,
    getRemotes: getRemotesMock,
    resolveFetchRemoteForRemotes: resolveFetchRemoteForRemotesMock,
  }
})

describe('local tag helpers', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitResultWithOptionsMock.mockReset()
    getRemotesMock.mockReset()
    resolveFetchRemoteForRemotesMock.mockReset()
    gitMock.mockResolvedValue('v2.0.0\nv1.0.0\n')
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'ok' })
    getRemotesMock.mockResolvedValue([{ name: 'origin', fetchUrl: 'git@github.com:a/b.git', pushUrl: 'git@github.com:a/b.git' }])
    resolveFetchRemoteForRemotesMock.mockReturnValue('origin')
  })

  test('lists local tags sorted by creatordate', async () => {
    await expect(getLocalTags('/repo')).resolves.toEqual(['v2.0.0', 'v1.0.0'])
    expect(gitMock).toHaveBeenCalledWith('/repo', ['tag', '--sort=-creatordate'], { signal: undefined })
  })

  test('creates a local tag from a ref', async () => {
    await expect(createLocalTag('/repo', 'v1.0.0', 'HEAD')).resolves.toEqual({ ok: true, message: 'ok' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith('/repo', { signal: undefined }, 'tag', 'v1.0.0', 'HEAD')
  })

  test('deletes a local tag by name', async () => {
    await expect(deleteLocalTag('/repo', 'v1.0.0')).resolves.toEqual({ ok: true, message: 'ok' })
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith('/repo', { signal: undefined }, 'tag', '-d', 'v1.0.0')
  })

  test('rejects unsafe tag names before invoking git', async () => {
    await expect(createLocalTag('/repo', '-bad', 'HEAD')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(deleteLocalTag('/repo', '-bad')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })

  test('pushes a local tag to the resolved remote', async () => {
    await expect(pushLocalTag('/repo', 'v1.0.0')).resolves.toEqual({ ok: true, message: 'ok' })
    expect(resolveFetchRemoteForRemotesMock).toHaveBeenCalledWith(
      [{ name: 'origin', fetchUrl: 'git@github.com:a/b.git', pushUrl: 'git@github.com:a/b.git' }],
      null,
    )
    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ signal: undefined }),
      'push',
      '--',
      'origin',
      'refs/tags/v1.0.0',
    )
  })

  test('returns error when no remote exists', async () => {
    resolveFetchRemoteForRemotesMock.mockReturnValue(null)
    await expect(pushLocalTag('/repo', 'v1.0.0')).resolves.toEqual({
      ok: false,
      message: 'error.push-no-remote',
    })
    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })

  test('rejects unsafe tag names before pushing', async () => {
    await expect(pushLocalTag('/repo', '-bad')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })
})
