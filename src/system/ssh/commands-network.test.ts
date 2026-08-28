import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'

const execaMock = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: execaMock,
  ExecaError: class MockExecaError extends Error {
    timedOut = false
    isCanceled = false
    stdout = ''
    stderr = ''
  },
}))

const WSL_TARGET = normalizeRemoteTarget({
  transport: 'wsl',
  alias: 'Ubuntu-24.04',
  host: 'Ubuntu-24.04',
  user: 'wsl',
  port: 22,
  remotePath: '/srv/repo',
  wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
})!

const SSH_TARGET = normalizeRemoteTarget({
  alias: 'prod',
  host: 'example.test',
  user: 'dev',
  port: 22,
  remotePath: '/srv/repo',
})!

describe('runRemoteCommand WSL environment forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('WSLENV', 'EXISTING/u')
    execaMock.mockResolvedValue({ stdout: '', stderr: '' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('forwards explicit process variables through a merged WSLENV', async () => {
    await runRemoteCommand(
      WSL_TARGET,
      { type: 'gitStatus', path: '/srv/repo' },
      {
        wslEnvironment: {
          HTTP_PROXY: 'http://127.0.0.1:7890',
          HTTPS_PROXY: 'http://127.0.0.1:7890',
        },
      },
    )

    expect(execaMock).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\wsl.exe',
      expect.arrayContaining(['--distribution', 'Ubuntu-24.04', '--exec', 'sh', '-lc']),
      expect.objectContaining({
        env: {
          HTTP_PROXY: 'http://127.0.0.1:7890',
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          WSLENV: 'EXISTING/u:HTTP_PROXY:HTTPS_PROXY',
        },
      }),
    )
  })

  test('never forwards WSL-only environment values to an SSH process', async () => {
    await runRemoteCommand(
      SSH_TARGET,
      { type: 'gitStatus', path: '/srv/repo' },
      {
        wslEnvironment: { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      },
    )

    const options = execaMock.mock.calls[0]?.[2]
    expect(options).not.toHaveProperty('env')
  })
})
