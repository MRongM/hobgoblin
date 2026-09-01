import { beforeEach, describe, expect, test, vi } from 'vitest'

class MockExecaError extends Error {
  timedOut = false
  isCanceled = false
  stderr = ''
}

function msysSshStartupError(): MockExecaError {
  const error = new MockExecaError('Git SSH failed')
  error.stderr =
    '0 [main] ssh (1584) C:\\Program Files\\Git\\usr\\bin\\ssh.exe: *** fatal error - add_item ("\\??\\C:\\Program Files\\Git", "/", ...) failed, errno 1'
  return error
}

const { execaMock, resolveGitExecutableMock, resolveNativeWindowsOpenSshExecutableMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  resolveGitExecutableMock: vi.fn(),
  resolveNativeWindowsOpenSshExecutableMock: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: execaMock,
  ExecaError: MockExecaError,
}))

vi.mock('#/system/git/executable.ts', () => ({
  resolveGitExecutable: resolveGitExecutableMock,
}))

vi.mock('#/system/ssh/executable.ts', () => ({
  resolveNativeWindowsOpenSshExecutable: resolveNativeWindowsOpenSshExecutableMock,
}))

describe('git network helper options', () => {
  beforeEach(() => {
    execaMock.mockReset()
    execaMock.mockResolvedValue({ stdout: 'ok\n', stderr: '' })
    resolveGitExecutableMock.mockReset()
    resolveGitExecutableMock.mockReturnValue('git')
    resolveNativeWindowsOpenSshExecutableMock.mockReset()
    resolveNativeWindowsOpenSshExecutableMock.mockReturnValue('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
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

  test('retries the exact MSYS SSH startup failure once with native Windows OpenSSH', async () => {
    execaMock.mockRejectedValueOnce(msysSshStartupError()).mockResolvedValueOnce({ stdout: 'resolved\n', stderr: '' })
    const { buildGitNetworkEnv, git } = await import('#/system/git/helper.ts')

    await expect(
      git('/repo', ['fetch'], { timeoutMs: 120_000, env: buildGitNetworkEnv('http://127.0.0.1:7890') }),
    ).resolves.toBe('resolved')

    expect(execaMock).toHaveBeenCalledTimes(2)
    expect(execaMock).toHaveBeenNthCalledWith(
      2,
      'git',
      ['fetch'],
      expect.objectContaining({
        cwd: '/repo',
        timeout: 120_000,
        env: expect.objectContaining({
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          GIT_SSH: 'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
          GIT_SSH_VARIANT: 'ssh',
        }),
      }),
    )
  })

  test('does not retry an unrelated SSH failure', async () => {
    const permissionDenied = new MockExecaError('Permission denied')
    permissionDenied.stderr = 'git@github.com: Permission denied (publickey).'
    execaMock.mockRejectedValueOnce(permissionDenied)
    const { git } = await import('#/system/git/helper.ts')

    await expect(git('/repo', ['fetch'])).rejects.toBe(permissionDenied)
    expect(execaMock).toHaveBeenCalledTimes(1)
  })

  test('does not retry an MSYS failure from a lookalike non-SSH process', async () => {
    const error = new MockExecaError('MSYS helper failed')
    error.stderr =
      '0 [main] myssh-helper (1584) C:\\Tools\\myssh-helper.exe: *** fatal error - add_item ("\\??\\C:\\Tools", "/", ...) failed, errno 1'
    execaMock.mockRejectedValueOnce(error)
    const { git } = await import('#/system/git/helper.ts')

    await expect(git('/repo', ['fetch'])).rejects.toBe(error)
    expect(execaMock).toHaveBeenCalledTimes(1)
  })

  test('does not retry when native Windows OpenSSH is unavailable', async () => {
    const error = msysSshStartupError()
    execaMock.mockRejectedValueOnce(error)
    resolveNativeWindowsOpenSshExecutableMock.mockReturnValueOnce(null)
    const { git } = await import('#/system/git/helper.ts')

    await expect(git('/repo', ['fetch'])).rejects.toBe(error)
    expect(execaMock).toHaveBeenCalledTimes(1)
  })

  test.each(['GIT_SSH', 'git_ssh_command'])(
    'preserves the explicit %s environment override instead of retrying',
    async (name) => {
      const error = msysSshStartupError()
      execaMock.mockRejectedValueOnce(error)
      const { git } = await import('#/system/git/helper.ts')

      await expect(git('/repo', ['fetch'], { env: { [name]: 'custom-ssh' } })).rejects.toBe(error)
      expect(execaMock).toHaveBeenCalledTimes(1)
    },
  )

  test('preserves an inherited GIT_SSH_COMMAND override instead of retrying', async () => {
    const original = process.env.GIT_SSH_COMMAND
    process.env.GIT_SSH_COMMAND = 'custom-ssh'
    const error = msysSshStartupError()
    execaMock.mockRejectedValueOnce(error)
    const { git } = await import('#/system/git/helper.ts')

    try {
      await expect(git('/repo', ['fetch'])).rejects.toBe(error)
      expect(execaMock).toHaveBeenCalledTimes(1)
    } finally {
      if (original === undefined) delete process.env.GIT_SSH_COMMAND
      else process.env.GIT_SSH_COMMAND = original
    }
  })

  test('does not retry after cancellation', async () => {
    const controller = new AbortController()
    const error = msysSshStartupError()
    execaMock.mockImplementationOnce(async () => {
      controller.abort()
      throw error
    })
    const { git } = await import('#/system/git/helper.ts')

    await expect(git('/repo', ['fetch'], { signal: controller.signal })).rejects.toBe(error)
    expect(execaMock).toHaveBeenCalledTimes(1)
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
