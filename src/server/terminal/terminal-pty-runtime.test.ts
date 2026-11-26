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
  test('starts a terminal AI directly through the local login shell', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    vi.stubEnv('SHELL', '/bin/zsh')
    spawnMock.mockReturnValue(terminalPty('codex'))
    expect(spawnTerminalPtyRuntime({ cwd: '/workspace', cols: 80, rows: 24, agentProvider: 'codex' }).ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lic', 'exec codex'],
      expect.objectContaining({ cwd: '/workspace' }),
    )
  })

  test('uses the system shell on Linux when SHELL is unset', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    vi.stubEnv('SHELL', undefined)
    spawnMock.mockReturnValue(terminalPty('claude'))
    expect(spawnTerminalPtyRuntime({ cwd: '/workspace', cols: 80, rows: 24, agentProvider: 'claude' }).ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/sh',
      ['-lic', 'exec claude'],
      expect.objectContaining({ cwd: '/workspace' }),
    )
  })

  test.each([
    [
      'wsl',
      ['--cd', 'C:\\workspace'],
      ['--cd', 'C:\\workspace', '--exec', 'sh', '-lc', expect.stringContaining('exec claude')],
    ],
    ['powershell-core', ['-NoLogo'], ['-NoLogo', '-Command', 'claude']],
    ['windows-powershell', ['-NoLogo'], ['-NoLogo', '-Command', 'claude']],
    ['cmd', [], ['/d', '/c', 'claude']],
  ])('starts a terminal AI with the Windows %s adapter', (kind, args, expected) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const command = 'C:\\Tools\\shell.exe'
    resolveWindowsShellCandidatesMock.mockReturnValue([{ kind, command, args }])
    spawnMock.mockReturnValue(terminalPty('claude'))
    expect(spawnTerminalPtyRuntime({ cwd: 'C:\\workspace', cols: 80, rows: 24, agentProvider: 'claude' }).ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledWith(command, expected, expect.objectContaining({ useConptyDll: true }))
  })

  test('starts the PTY without inherited server credentials', () => {
    vi.stubEnv('GOBLIN_SERVER_INTERNAL_SECRET', 'example-internal-secret')
    vi.stubEnv('GOBLIN_OPEN_API_TOKEN', 'example-open-api-token')
    vi.stubEnv('GOBLIN_OPEN_API_CONTROL_TOKEN', 'example-control-token')
    spawnMock.mockReturnValue(terminalPty('shell'))

    expect(spawnTerminalPtyRuntime({ command: 'shell', cwd: process.cwd(), cols: 80, rows: 24 }).ok).toBe(true)
    const env = spawnMock.mock.calls[0]?.[2].env
    expect(env.TERM).toBe('xterm-256color')
    expect(env).not.toHaveProperty('GOBLIN_SERVER_INTERNAL_SECRET')
    expect(env).not.toHaveProperty('GOBLIN_OPEN_API_TOKEN')
    expect(env).not.toHaveProperty('GOBLIN_OPEN_API_CONTROL_TOKEN')
  })
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
    expect(resolveWindowsShellCandidatesMock).toHaveBeenCalledWith({ cwd: 'C:\\repo' })
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      ['-NoLogo'],
      expect.objectContaining({ cwd: 'C:\\repo' }),
    )
  })

  test('forwards an explicit Windows internal terminal shell preference to candidate resolution', () => {
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
      cwd: 'C:\\repo',
      cols: 80,
      rows: 24,
      windowsInternalTerminalShell: 'powershell',
    })

    expect(result.ok).toBe(true)
    expect(resolveWindowsShellCandidatesMock).toHaveBeenCalledWith({
      cwd: 'C:\\repo',
      preference: 'powershell',
    })
  })

  test.each(['wsl', 'powershell', 'cmd'] as const)(
    'returns a selection-specific error when explicit %s has no usable candidate',
    (windowsInternalTerminalShell) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      resolveWindowsShellCandidatesMock.mockReturnValue([])

      expect(
        spawnTerminalPtyRuntime({
          cwd: 'C:\\repo',
          cols: 80,
          rows: 24,
          windowsInternalTerminalShell,
        }),
      ).toEqual({
        ok: false,
        message: `error.windows-internal-terminal-${windowsInternalTerminalShell}-unavailable`,
      })
      expect(spawnMock).not.toHaveBeenCalled()
    },
  )

  test('uses bundled ConPTY on Windows to avoid the system console host', () => {
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
      expect.objectContaining({ useConptyDll: true }),
    )
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
      windowsInternalTerminalShell: 'wsl',
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
