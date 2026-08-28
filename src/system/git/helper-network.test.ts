import { beforeEach, describe, expect, test, vi } from 'vitest'

class MockExecaError extends Error {
  timedOut = false
  isCanceled = false
  stderr = ''
}

const { execaMock, resolveGitExecutableMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  resolveGitExecutableMock: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: execaMock,
  ExecaError: MockExecaError,
}))

vi.mock('#/system/git/executable.ts', () => ({
  resolveGitExecutable: resolveGitExecutableMock,
}))

describe('git network helper options', () => {
  beforeEach(() => {
    execaMock.mockReset()
    execaMock.mockResolvedValue({ stdout: 'ok\n', stderr: '' })
    resolveGitExecutableMock.mockReset()
    resolveGitExecutableMock.mockReturnValue('git')
  })

  test('does not build proxy env for missing or unsupported proxy urls', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv(undefined)).toBeUndefined()
    expect(buildGitNetworkEnv('')).toBeUndefined()
    expect(buildGitNetworkEnv('ftp://127.0.0.1:21')).toBeUndefined()
  })

  test('builds HTTP and HTTPS proxy env variables', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv('http://127.0.0.1:7890')).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
    })
  })

  test('builds SOCKS5 proxy env variables', async () => {
    const { buildGitNetworkEnv } = await import('#/system/git/helper.ts')

    expect(buildGitNetworkEnv('socks5://127.0.0.1:7890')).toEqual({
      ALL_PROXY: 'socks5://127.0.0.1:7890',
      HTTPS_PROXY: 'socks5://127.0.0.1:7890',
      all_proxy: 'socks5://127.0.0.1:7890',
      https_proxy: 'socks5://127.0.0.1:7890',
    })
  })

  test('passes env to execa for a git invocation', async () => {
    const { buildGitNetworkEnv, git } = await import('#/system/git/helper.ts')
    const env = buildGitNetworkEnv('socks5://127.0.0.1:7890')

    await expect(git('/repo', ['fetch'], { timeoutMs: 120_000, env })).resolves.toBe('ok')

    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['fetch'],
      expect.objectContaining({
        cwd: '/repo',
        timeout: 120_000,
        env: expect.objectContaining(env ?? {}),
      }),
    )
  })

  test('uses the resolved executable with deterministic non-interactive output settings', async () => {
    resolveGitExecutableMock.mockReturnValue('C:\\Program Files\\Git\\cmd\\git.exe')
    const { buildGitNetworkEnv, git } = await import('#/system/git/helper.ts')

    await git('/repo', ['fetch'], {
      env: buildGitNetworkEnv('http://127.0.0.1:7890'),
    })

    expect(execaMock).toHaveBeenCalledWith(
      'C:\\Program Files\\Git\\cmd\\git.exe',
      ['fetch'],
      expect.objectContaining({
        env: expect.objectContaining({
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          LANGUAGE: 'en',
          LC_ALL: 'en_US.UTF-8',
          LANG: 'en_US.UTF-8',
          GIT_PAGER: 'cat',
        }),
      }),
    )
  })

  test('reports timeout using the configured timeout seconds', async () => {
    const err = new MockExecaError('timed out')
    err.timedOut = true
    execaMock.mockRejectedValueOnce(err)
    const { gitResultWithOptions } = await import('#/system/git/helper.ts')

    await expect(gitResultWithOptions('/repo', { timeoutMs: 120_000 }, 'fetch')).resolves.toEqual({
      ok: false,
      message: 'git timed out after 120s',
    })
  })
})
