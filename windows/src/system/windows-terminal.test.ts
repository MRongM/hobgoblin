import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { clearWindowsWslProbeCache } from '#/shared/windows-wsl.ts'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  hasCommand: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true, isFile: () => true })),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, spawnSync: mocks.spawnSync }))
vi.mock('node:fs', () => ({ statSync: mocks.statSync }))
vi.mock('#/system/command.ts', () => ({
  hasCommand: mocks.hasCommand,
}))

describe('windows terminal backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearWindowsWslProbeCache()
    mocks.execa.mockResolvedValue({})
    mocks.spawn.mockImplementation(() => spawnedChild())
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: '' })
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe')
    vi.stubEnv('SystemRoot', 'C:\\Windows')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('opens the default WSL distribution in Windows Terminal in the requested directory', async () => {
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo', 'C:\\Windows\\System32\\wsl.exe'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    expect(mocks.spawnSync).toHaveBeenCalledWith('C:\\Windows\\System32\\wsl.exe', ['--list', '--quiet'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    })
    expect(mocks.spawn.mock.results[0]!.value.unref).toHaveBeenCalledOnce()
  })

  test('opens the native Windows Terminal profile when no WSL distribution is registered', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    expect(mocks.spawn.mock.results[0]!.value.unref).toHaveBeenCalledOnce()
  })

  test('opens explicitly selected WSL without falling back to another shell', async () => {
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo', 'wsl')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo', 'C:\\Windows\\System32\\wsl.exe'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('opens explicitly selected PowerShell in Windows Terminal', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe' || command === 'powershell.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo', 'powershell')).resolves.toEqual({
      ok: true,
      message: 'C:\\repo',
    })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo', 'powershell.exe', '-NoLogo', '-NoExit'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
  })

  test('opens explicitly selected Command Prompt in Windows Terminal', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe' || command === 'cmd.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo', 'cmd')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo', 'cmd.exe', '/K'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
  })

  test('uses a standalone Command Prompt when Windows Terminal is unavailable', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'cmd.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo', 'cmd')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/K'],
      expect.objectContaining({ cwd: 'C:\\repo', detached: true, stdio: 'ignore' }),
    )
  })

  test('reports selected WSL as unavailable instead of changing shells', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'powershell.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo', 'wsl')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('opens a selected WSL distribution at an absolute Linux path', async () => {
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: 'Ubuntu-24.04\n' })
    const { openWslInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openWslInWindowsTerminal('Ubuntu-24.04', '/root/src/repo')).resolves.toEqual({
      ok: true,
      message: '/root/src/repo',
    })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['C:\\Windows\\System32\\wsl.exe', '--distribution', 'Ubuntu-24.04', '--cd', '/root/src/repo'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
  })

  test('falls back to PowerShell when wt.exe is unavailable', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'powershell.exe')
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', expect.stringContaining('Start-Process')],
      expect.objectContaining({
        env: expect.objectContaining({ HOBGOBLIN_WINDOWS_TERMINAL_CWD: 'C:\\repo' }),
        timeout: 10_000,
        windowsHide: true,
      }),
    )
    expect(mocks.execa.mock.calls[0]![1].at(-1)).toContain('$env:HOBGOBLIN_WINDOWS_TERMINAL_CWD')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  test('reports a detached terminal spawn failure', async () => {
    mocks.spawn.mockImplementationOnce(() => failedSpawn(new Error('spawn failed')))
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({
      ok: false,
      message: 'spawn failed',
    })
  })

  test('falls back to PowerShell when Windows Terminal cannot be spawned', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe' || command === 'powershell.exe')
    mocks.spawn.mockImplementationOnce(() => failedSpawn(new Error('spawn failed')))
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.execa).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', expect.stringContaining('Start-Process')],
      expect.objectContaining({
        env: expect.objectContaining({ HOBGOBLIN_WINDOWS_TERMINAL_CWD: 'C:\\repo' }),
        timeout: 10_000,
        windowsHide: true,
      }),
    )
  })

  test('reports a PowerShell launcher failure', async () => {
    mocks.hasCommand.mockImplementation((command: string) => command === 'powershell.exe')
    mocks.execa.mockRejectedValueOnce(new Error('PowerShell launch failed'))
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({
      ok: false,
      message: 'PowerShell launch failed',
    })
  })

  test('reports terminal-not-installed when no Windows shell command is available', async () => {
    mocks.hasCommand.mockReturnValue(false)
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  test('rejects invalid Windows terminal paths', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('relative\\repo')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-path',
    })
  })
})

function spawnedChild() {
  const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
  child.unref = vi.fn()
  queueMicrotask(() => child.emit('spawn'))
  return child
}

function failedSpawn(error: Error) {
  const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
  child.unref = vi.fn()
  queueMicrotask(() => child.emit('error', error))
  return child
}
