import { beforeEach, describe, expect, test, vi } from 'vitest'

const { execaMock, resolveUsableWindowsWslExecutableMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  resolveUsableWindowsWslExecutableMock: vi.fn(),
}))

vi.mock('execa', () => ({
  execa: execaMock,
}))

vi.mock('#/shared/windows-wsl.ts', () => ({
  resolveUsableWindowsWslExecutable: resolveUsableWindowsWslExecutableMock,
}))

describe('listWindowsWslDistributions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveUsableWindowsWslExecutableMock.mockReturnValue('C:\\Windows\\System32\\wsl.exe')
    execaMock.mockResolvedValue({ stdout: 'Ubuntu-24.04\r\n开发环境\r\n' })
  })

  test('decodes the explicit UTF-16LE WSL distribution-list contract', async () => {
    const { listWindowsWslDistributions } = await import('#/system/wsl/distributions.ts')

    await expect(listWindowsWslDistributions()).resolves.toEqual(['Ubuntu-24.04', '开发环境'])
    expect(execaMock).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\wsl.exe',
      ['--list', '--quiet'],
      expect.objectContaining({
        encoding: 'utf16le',
        env: expect.objectContaining({ WSL_UTF8: '0' }),
        timeout: 5_000,
        windowsHide: true,
      }),
    )
  })
})
