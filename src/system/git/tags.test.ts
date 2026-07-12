import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createLocalTag, deleteLocalTag, getLocalTags } from '#/system/git/tags.ts'

const gitMock = vi.hoisted(() => vi.fn())
const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    git: gitMock,
    gitResultWithOptions: gitResultWithOptionsMock,
  }
})

describe('local tag helpers', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitResultWithOptionsMock.mockReset()
    gitMock.mockResolvedValue('v2.0.0\nv1.0.0\n')
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'ok' })
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
})
