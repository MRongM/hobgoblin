import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  git: vi.fn(),
}))

vi.mock('#/system/git/helper.ts', () => ({
  git: mocks.git,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveDiffBaseAfterHeadFailure', () => {
  test('does not probe when the original diff timed out', async () => {
    const timeoutError = Object.assign(new Error('timed out'), { exitCode: 128, timedOut: true })
    const { resolveDiffBaseAfterHeadFailure } = await import('#/system/git/diff-base.ts')

    await expect(resolveDiffBaseAfterHeadFailure('/repo', timeoutError)).rejects.toBe(timeoutError)
    expect(mocks.git).not.toHaveBeenCalled()
  })

  test('propagates an error raised while probing HEAD', async () => {
    const diffError = Object.assign(new Error('bad revision'), { exitCode: 128 })
    const probeError = Object.assign(new Error('probe timed out'), { timedOut: true })
    mocks.git.mockRejectedValueOnce(probeError)
    const { resolveDiffBaseAfterHeadFailure } = await import('#/system/git/diff-base.ts')

    await expect(resolveDiffBaseAfterHeadFailure('/repo', diffError)).rejects.toBe(probeError)
  })

  test('resolves the empty tree only when the symbolic branch ref is missing', async () => {
    const diffError = Object.assign(new Error('bad revision'), { exitCode: 128 })
    const missingRefError = Object.assign(new Error('missing ref'), { exitCode: 1 })
    mocks.git
      .mockResolvedValueOnce('refs/heads/main')
      .mockRejectedValueOnce(missingRefError)
      .mockResolvedValueOnce('empty-tree-id')
    const { resolveDiffBaseAfterHeadFailure } = await import('#/system/git/diff-base.ts')

    await expect(resolveDiffBaseAfterHeadFailure('/repo', diffError)).resolves.toBe('empty-tree-id')
    expect(mocks.git).toHaveBeenNthCalledWith(1, '/repo', ['symbolic-ref', '--quiet', 'HEAD'], { signal: undefined })
    expect(mocks.git).toHaveBeenNthCalledWith(2, '/repo', ['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
      signal: undefined,
    })
  })

  test('preserves the original diff error when the symbolic branch ref exists', async () => {
    const diffError = Object.assign(new Error('corrupt HEAD tree'), { exitCode: 128 })
    mocks.git.mockResolvedValueOnce('refs/heads/main').mockResolvedValueOnce('')
    const { resolveDiffBaseAfterHeadFailure } = await import('#/system/git/diff-base.ts')

    await expect(resolveDiffBaseAfterHeadFailure('/repo', diffError)).rejects.toBe(diffError)
    expect(mocks.git).toHaveBeenCalledTimes(2)
  })
})
