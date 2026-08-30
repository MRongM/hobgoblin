import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { resolveWindowsTerminalShellCandidates } from '#/server/terminal/windows-terminal-shell.ts'

const { probeWslMock } = vi.hoisted(() => ({
  probeWslMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawnSync: probeWslMock,
}))

describe('resolveWindowsTerminalShellCandidates', () => {
  test('prefers a WSL shell with a registered distribution before native Windows shells', () => {
    probeWslMock.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        cwd: 'C:\\src\\repo',
        env: {
          ProgramFiles: 'C:\\Program Files',
          SystemRoot: 'C:\\Windows',
        },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'wsl',
        command: 'C:\\Windows\\System32\\wsl.exe',
        args: ['--cd', 'C:\\src\\repo'],
      },
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
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
    expect(probeWslMock).toHaveBeenCalledWith('C:\\Windows\\System32\\wsl.exe', ['--list', '--quiet'], {
      encoding: 'utf16le',
      env: expect.objectContaining({ WSL_UTF8: '0' }),
      timeout: 5_000,
      windowsHide: true,
    })
  })

  test('omits WSL for a Windows UNC working directory and retains native fallbacks', () => {
    probeWslMock.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        cwd: '\\\\server\\share\\repo',
        env: { SystemRoot: 'C:\\Windows' },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
    ])
  })

  test.each([
    ['wsl', ['wsl']],
    ['powershell', ['powershell-core', 'windows-powershell']],
    ['cmd', ['cmd']],
  ] as const)('keeps an explicit %s preference inside its selected shell family', (preference, expectedKinds) => {
    probeWslMock.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    )

    const candidates = resolveWindowsTerminalShellCandidates({
      preference,
      cwd: 'C:\\src\\repo',
      env: {
        ProgramFiles: 'C:\\Program Files',
        SystemRoot: 'C:\\Windows',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      },
      fileExists,
    })

    expect(candidates.map(({ kind }) => kind)).toEqual(expectedKinds)
  })

  test('makes explicit WSL unavailable for a Windows UNC working directory', () => {
    probeWslMock.mockReturnValue({ status: 0, stdout: 'Ubuntu\n' })
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        preference: 'wsl',
        cwd: '\\\\server\\share\\repo',
        env: { SystemRoot: 'C:\\Windows' },
        fileExists,
      }),
    ).toEqual([])
  })

  test('falls back to native Windows shells when no WSL distribution is registered', () => {
    probeWslMock.mockReturnValue({ status: 0, stdout: '' })
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\wsl.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        env: { SystemRoot: 'C:\\Windows' },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
  })

  test('prefers the stable PowerShell 7 install before PATH and system fallbacks', () => {
    const fileExists = existingFiles(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Tools\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          ProgramFiles: 'C:\\Program Files',
          SystemRoot: 'C:\\Windows',
          PATH: 'C:\\Tools',
          COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'powershell-core',
        command: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        args: ['-NoLogo'],
      },
      { kind: 'powershell-core', command: 'C:\\Tools\\pwsh.exe', args: ['-NoLogo'] },
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
  })

  test('finds a PATH PowerShell case-insensitively and strips directory quotes', () => {
    const fileExists = existingFiles('C:\\Users\\dev\\PowerShell\\pwsh.exe')

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          path: 'relative\\tools;"C:\\Users\\dev\\PowerShell"',
        },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'powershell-core',
        command: 'C:\\Users\\dev\\PowerShell\\pwsh.exe',
        args: ['-NoLogo'],
      },
    ])
  })

  test('falls back to the Windows PowerShell system executable when PowerShell 7 is absent', () => {
    const fileExists = existingFiles(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
    )

    expect(
      resolveWindowsTerminalShellCandidates({
        env: { WINDIR: 'C:\\Windows' },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'windows-powershell',
        command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-NoLogo'],
      },
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
  })

  test('ignores a relative COMSPEC and uses the absolute system cmd fallback', () => {
    const fileExists = existingFiles('C:\\Windows\\System32\\cmd.exe')

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          SystemRoot: 'C:\\Windows',
          COMSPEC: 'cmd.exe',
        },
        fileExists,
      }),
    ).toEqual([{ kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] }])
  })

  test('uses an absolute custom COMSPEC before the system cmd fallback', () => {
    const fileExists = existingFiles('D:\\System\\cmd.exe', 'C:\\Windows\\System32\\cmd.exe')

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          SystemRoot: 'C:\\Windows',
          COMSPEC: 'D:\\System\\cmd.exe',
        },
        fileExists,
      }),
    ).toEqual([
      { kind: 'cmd', command: 'D:\\System\\cmd.exe', args: [] },
      { kind: 'cmd', command: 'C:\\Windows\\System32\\cmd.exe', args: [] },
    ])
  })

  test('deduplicates equivalent candidate paths without changing the first path spelling', () => {
    const fileExists = existingFiles('C:\\PROGRAM FILES\\PowerShell\\7\\pwsh.exe')

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          ProgramW6432: 'C:\\PROGRAM FILES',
          ProgramFiles: 'c:\\program files',
          PATH: 'C:\\PROGRAM FILES\\PowerShell\\7',
        },
        fileExists,
      }),
    ).toEqual([
      {
        kind: 'powershell-core',
        command: 'C:\\PROGRAM FILES\\PowerShell\\7\\pwsh.exe',
        args: ['-NoLogo'],
      },
    ])
  })

  test('never probes relative PATH entries or the current repository directory', () => {
    const fileExists = vi.fn(() => false)

    expect(
      resolveWindowsTerminalShellCandidates({
        env: {
          PATH: '.;tools;..\\bin',
          COMSPEC: '.\\cmd.exe',
        },
        fileExists,
      }),
    ).toEqual([])
    expect(fileExists).not.toHaveBeenCalled()
  })
})

function existingFiles(...files: string[]): (candidate: string) => boolean {
  const normalized = new Set(files.map(normalizeWindowsPath))
  return (candidate) => normalized.has(normalizeWindowsPath(candidate))
}

function normalizeWindowsPath(value: string): string {
  return path.win32.normalize(value).toLowerCase()
}
