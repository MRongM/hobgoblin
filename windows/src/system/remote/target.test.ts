import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveSshRemoteTarget: vi.fn(),
  resolveUsableWindowsWslExecutable: vi.fn(),
  listWindowsWslDistributions: vi.fn(),
}))

vi.mock('#/system/ssh/config.ts', () => ({
  resolveRemoteTarget: mocks.resolveSshRemoteTarget,
}))
vi.mock('#/shared/windows-wsl.ts', () => ({
  resolveUsableWindowsWslExecutable: mocks.resolveUsableWindowsWslExecutable,
}))
vi.mock('#/system/wsl/distributions.ts', () => ({
  listWindowsWslDistributions: mocks.listWindowsWslDistributions,
}))

describe('repository remote target resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveUsableWindowsWslExecutable.mockReturnValue('C:\\Windows\\System32\\wsl.exe')
    mocks.listWindowsWslDistributions.mockResolvedValue(['Ubuntu-24.04'])
  })

  test('delegates existing SSH identities to SSH config resolution', async () => {
    const resolved = { target: { id: 'ssh-config://prod/srv/repo' } }
    mocks.resolveSshRemoteTarget.mockResolvedValue(resolved)
    const { resolveRepositoryRemoteTarget } = await import('#/system/remote/target.ts')

    await expect(resolveRepositoryRemoteTarget({ alias: 'prod', remotePath: '/srv/repo' })).resolves.toBe(resolved)
  })

  test('resolves a WSL identity only in an installed distribution', async () => {
    const { resolveRepositoryRemoteTarget } = await import('#/system/remote/target.ts')

    await expect(
      resolveRepositoryRemoteTarget({ transport: 'wsl', alias: 'Ubuntu-24.04', remotePath: '/root/src/repo' }),
    ).resolves.toEqual({
      target: {
        id: 'wsl://Ubuntu-24.04/root/src/repo',
        alias: 'Ubuntu-24.04',
        host: 'Ubuntu-24.04',
        user: 'wsl',
        port: 22,
        remotePath: '/root/src/repo',
        displayName: 'Ubuntu-24.04:repo',
        transport: 'wsl',
        wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
      },
    })
  })

  test('rejects a WSL identity whose distribution is no longer installed', async () => {
    mocks.listWindowsWslDistributions.mockResolvedValue(['Debian'])
    const { resolveRepositoryRemoteTarget } = await import('#/system/remote/target.ts')

    await expect(
      resolveRepositoryRemoteTarget({ transport: 'wsl', alias: 'Ubuntu-24.04', remotePath: '/root/src/repo' }),
    ).rejects.toThrow('error.wsl-distribution-unavailable')
  })
})
