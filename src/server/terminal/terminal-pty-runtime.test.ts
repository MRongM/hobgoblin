import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { detectWindowsPtyCompatibility, spawnTerminalPtyRuntime } from '#/server/terminal/terminal-pty-runtime.ts'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}))

beforeEach(() => {
  spawnMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('spawnTerminalPtyRuntime', () => {
  test('prefers COMSPEC over a POSIX SHELL on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.stubEnv('SHELL', '/usr/bin/bash')
    vi.stubEnv('COMSPEC', 'C:\\Windows\\System32\\cmd.exe')
    spawnMock.mockReturnValue(terminalPty())

    const result = spawnTerminalPtyRuntime({
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      [],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    )
  })

  test('detects ConPTY compatibility on modern Windows builds', () => {
    expect(detectWindowsPtyCompatibility('win32', '10.0.22631')).toEqual({
      backend: 'conpty',
      buildNumber: 22631,
    })
  })

  test('detects winpty compatibility on Windows builds before node-pty ConPTY default', () => {
    expect(detectWindowsPtyCompatibility('win32', '10.0.17763')).toEqual({
      backend: 'winpty',
      buildNumber: 17763,
    })
  })

  test('omits Windows PTY compatibility on non-Windows platforms', () => {
    expect(detectWindowsPtyCompatibility('darwin', '25.0.0')).toBeNull()
  })

  test('returns a trimmed process name when node-pty exposes a string', () => {
    spawnMock.mockReturnValue({
      process: ' zsh ',
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    })

    const result = spawnTerminalPtyRuntime({
      cwd: '/repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('zsh')
  })

  test('falls back to terminal when the process getter throws', () => {
    spawnMock.mockReturnValue({
      get process() {
        throw new Error('process unavailable')
      },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    })

    const result = spawnTerminalPtyRuntime({
      cwd: '/repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('terminal')
  })

  test('reads the process getter only once per lookup', () => {
    let reads = 0
    spawnMock.mockReturnValue({
      get process() {
        reads += 1
        return reads === 1 ? 'zsh' : undefined
      },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    })

    const result = spawnTerminalPtyRuntime({
      cwd: '/repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('zsh')
    expect(reads).toBe(1)
  })
})

function terminalPty() {
  return {
    process: 'cmd.exe',
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
  }
}
