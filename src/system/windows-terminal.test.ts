import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  hasCommand: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({ statSync: mocks.statSync }))
vi.mock('#/system/command.ts', () => ({
  hasCommand: mocks.hasCommand,
}))

describe('windows terminal backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execa.mockResolvedValue({ failed: false })
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe')
  })

  test('opens Windows Terminal in the requested directory', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo'],
      expect.objectContaining({ timeout: 10_000 }),
    )
  })

  test('falls back to PowerShell when wt.exe is unavailable', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'powershell.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoExit', '-Command', 'Set-Location -LiteralPath $args[0]', 'C:\\repo'],
      expect.objectContaining({ timeout: 10_000 }),
    )
  })

  test('reports terminal-not-installed when no Windows shell command is available', async () => {
    mocks.hasCommand.mockReturnValue(false)
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('rejects invalid Windows terminal paths', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('relative\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-path',
    })
  })
})
