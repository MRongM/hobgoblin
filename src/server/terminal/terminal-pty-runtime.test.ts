import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { detectWindowsPtyCompatibility, spawnTerminalPtyRuntime } from '#/server/terminal/terminal-pty-runtime.ts'

const { resolveWindowsShellCandidatesMock, spawnMock } = vi.hoisted(() => ({
  resolveWindowsShellCandidatesMock: vi.fn(),
  spawnMock: vi.fn(),
}))

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}))

vi.mock('#/server/terminal/windows-terminal-shell.ts', () => ({
  resolveWindowsTerminalShellCandidates: resolveWindowsShellCandidatesMock,
}))

beforeEach(() => {
  spawnMock.mockReset()
  resolveWindowsShellCandidatesMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('spawnTerminalPtyRuntime', () => {
  test('starts the first resolved PowerShell candidate on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    resolveWindowsShellCandidatesMock.mockReturnValue([
      {
        kind: 'powershell-core',
        command: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        args: ['-NoLogo'],
      },
    ])
    spawnMock.mockReturnValue(terminalPty('xterm-256color'))

    const result = spawnTerminalPtyRuntime({
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('pwsh.exe')
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      ['-NoLogo'],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    )
  })

  test('declares both xterm-256color and truecolor for spawned terminal applications', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    resolveWindowsShellCandidatesMock.mockReturnValue([
      {
        kind: 'powershell-core',
        command: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        args: ['-NoLogo'],
      },
    ])
    spawnMock.mockReturnValue(terminalPty('pwsh.exe'))

    spawnTerminalPtyRuntime({
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
    })

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }),
      }),
    )
  })

  test('sets the ConPTY default color table and attributes before launching an explicit Windows command', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    resolveWindowsShellCandidatesMock.mockReturnValue([
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
    ])
    spawnMock.mockReturnValue(terminalPty('powershell.exe'))

    const result = spawnTerminalPtyRuntime({
      command: 'C:\\Tools\\custom-shell.exe',
      args: ['--interactive', "value'with-quote"],
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
      windowsPtyAppearance: {
        foreground: { red: 0xf5, green: 0xf5, blue: 0xf7 },
        background: { red: 0x11, green: 0x11, blue: 0x13 },
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('custom-shell.exe')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [command, args] = spawnMock.mock.calls[0]!
    expect(command).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(args).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)])
    const script = Buffer.from(args[4] as string, 'base64').toString('utf16le')
    expect(script).toContain('GetConsoleScreenBufferInfoEx')
    expect(script).toContain('SetConsoleScreenBufferInfoEx')
    expect(script).toContain('C:\\Tools\\custom-shell.exe')
    expect(script).toContain("'--interactive'")
    expect(script).toContain("'value''with-quote'")
    expect(script).toContain('16250357')
    expect(script).toContain('1249553')
  })

  test('falls back when the preferred Windows shell cannot be spawned', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    resolveWindowsShellCandidatesMock.mockReturnValue([
      {
        kind: 'powershell-core',
        command: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        args: ['-NoLogo'],
      },
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
    ])
    spawnMock.mockImplementationOnce(() => {
      throw new Error('pwsh disappeared')
    })
    spawnMock.mockReturnValueOnce(terminalPty('powershell.exe'))

    const result = spawnTerminalPtyRuntime({
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      ['-NoLogo'],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoLogo'],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    )
  })

  test('returns the final spawn error when every Windows shell candidate fails', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    resolveWindowsShellCandidatesMock.mockReturnValue([
      { kind: 'powershell-core', command: 'C:\\Tools\\pwsh.exe', args: ['-NoLogo'] },
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
    spawnMock.mockImplementationOnce(() => {
      throw new Error('pwsh failed')
    })
    spawnMock.mockImplementationOnce(() => {
      throw new Error('cmd failed')
    })

    expect(
      spawnTerminalPtyRuntime({
        cwd: 'C:\\repo',
        cols: 80,
        rows: 24,
      }),
    ).toEqual({ ok: false, message: 'cmd failed' })
  })

  test('preserves an explicit trusted Windows command without resolving fallbacks', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    spawnMock.mockReturnValue(terminalPty('custom-shell.exe'))

    const result = spawnTerminalPtyRuntime({
      command: 'C:\\Tools\\custom-shell.exe',
      args: ['--interactive'],
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    expect(resolveWindowsShellCandidatesMock).not.toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Tools\\custom-shell.exe',
      ['--interactive'],
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
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    spawnMock.mockReturnValue({
      process: ' zsh ',
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
    })

    const result = spawnTerminalPtyRuntime({
      command: '/bin/zsh',
      args: ['-l'],
      cwd: '/repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('zsh')
  })

  test('falls back to terminal when the process getter throws', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
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
      command: '/bin/zsh',
      args: ['-l'],
      cwd: '/repo',
      cols: 80,
      rows: 24,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtime.processName()).toBe('terminal')
  })

  test('reads the process getter only once per lookup', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
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
      command: '/bin/zsh',
      args: ['-l'],
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

function terminalPty(processName = 'cmd.exe') {
  return {
    process: processName,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
  }
}
