import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  hasCommand: vi.fn(),
  spawn: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('node:fs', () => ({ statSync: mocks.statSync }))
vi.mock('#/system/command.ts', () => ({
  hasCommand: mocks.hasCommand,
}))

describe('windows terminal backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execa.mockResolvedValue({})
    mocks.spawn.mockImplementation(() => spawnedChild())
    mocks.hasCommand.mockImplementation((command: string) => command === 'wt.exe')
  })

  test('opens Windows Terminal in the requested directory', async () => {
    const { openInWindowsTerminal } = await import('#/system/windows-terminal.ts')

    await expect(openInWindowsTerminal('C:\\repo')).resolves.toEqual({ ok: true, message: 'C:\\repo' })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'wt.exe',
      ['-d', 'C:\\repo'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    expect(mocks.spawn.mock.results[0]!.value.unref).toHaveBeenCalledOnce()
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
