import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  openInPreferredTerminal,
  openRemoteInPreferredTerminal,
  openRemoteInTerminalBackend,
} from '#/system/terminals.ts'
import { openInAppleTerminal, openRemoteInAppleTerminal, isAppleTerminalInstalled } from '#/system/apple-terminal.ts'
import { isGhosttyInstalled, openInGhostty, openRemoteInGhostty } from '#/system/ghostty.ts'
import { isWindowsTerminalAvailable, openInWindowsTerminal } from '#/system/windows-terminal.ts'

vi.mock('#/system/ghostty.ts', () => ({
  isGhosttyInstalled: vi.fn(() => false),
  openInGhostty: vi.fn(async (target: { workingDirectory: string }) => ({
    ok: true,
    message: target.workingDirectory,
  })),
  openRemoteInGhostty: vi.fn(async (target: { alias: string; workingDirectory: string }) => ({
    ok: true,
    message: `${target.alias}:${target.workingDirectory}`,
  })),
}))

vi.mock('#/system/apple-terminal.ts', () => ({
  isAppleTerminalInstalled: vi.fn(async () => true),
  openInAppleTerminal: vi.fn(async (target: { workingDirectory: string }) => ({
    ok: true,
    message: target.workingDirectory,
  })),
  openRemoteInAppleTerminal: vi.fn(async (target: { alias: string; workingDirectory: string }) => ({
    ok: true,
    message: `${target.alias}:${target.workingDirectory}`,
  })),
}))

vi.mock('#/system/windows-terminal.ts', () => ({
  isWindowsTerminalAvailable: vi.fn(() => true),
  openInWindowsTerminal: vi.fn(async (path: string) => ({ ok: true, message: path })),
}))

describe('openInPreferredTerminal', () => {
  const originalPlatform = process.platform
  const localTarget = { projectRoot: '/repo', workingDirectory: '/repo', terminalNumber: 1 }
  const windowsTarget = { projectRoot: 'C:\\repo', workingDirectory: 'C:\\repo', terminalNumber: 1 }
  const remoteTarget = {
    alias: 'prod',
    projectRoot: '/srv/repo',
    workingDirectory: '/srv/repo-feature',
    terminalNumber: 1,
  }

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setPlatform('darwin')
  })

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  test('opens Terminal.app explicitly on darwin when detection reports available', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openInPreferredTerminal(localTarget, 'terminal')).resolves.toEqual({
      ok: true,
      message: '/repo',
    })
    expect(openInAppleTerminal).toHaveBeenCalledWith(localTarget, {})
  })

  test('prefers Ghostty in auto mode when it is installed', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(true)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await openInPreferredTerminal(localTarget, 'auto')

    expect(openInGhostty).toHaveBeenCalledWith(localTarget, {})
    expect(openInAppleTerminal).not.toHaveBeenCalled()
  })

  test('coalesces concurrent duplicate opens for the same normalized local target', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(true)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)
    let resolveOpen: ((result: { ok: true; message: string }) => void) | undefined
    vi.mocked(openInGhostty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve
        }),
    )

    const first = openInPreferredTerminal(localTarget, 'auto')
    const duplicate = openInPreferredTerminal(
      { ...localTarget, projectRoot: '/repo/', workingDirectory: '/repo/.' },
      'auto',
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openInGhostty).toHaveBeenCalledTimes(1)

    resolveOpen?.({ ok: true, message: localTarget.workingDirectory })
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { ok: true, message: localTarget.workingDirectory },
      { ok: true, message: localTarget.workingDirectory },
    ])
  })

  test('falls back to Terminal.app in auto mode when detection reports available', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openInPreferredTerminal(localTarget, 'auto')).resolves.toEqual({
      ok: true,
      message: '/repo',
    })

    expect(openInAppleTerminal).toHaveBeenCalledWith(localTarget, {})
  })

  test('does not open Terminal.app on darwin when detection reports unavailable', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(false)

    await expect(openInPreferredTerminal(localTarget, 'terminal')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(openInAppleTerminal).not.toHaveBeenCalled()
  })

  test('does not expose Terminal.app on linux when selected explicitly', async () => {
    setPlatform('linux')
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openInPreferredTerminal(localTarget, 'terminal')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(openInAppleTerminal).not.toHaveBeenCalled()
    expect(openInGhostty).not.toHaveBeenCalled()
  })

  test('does not fall back to Terminal.app in auto mode on linux', async () => {
    setPlatform('linux')
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openInPreferredTerminal(localTarget, 'auto')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(openInAppleTerminal).not.toHaveBeenCalled()
  })

  test('opens native Windows terminal for the existing terminal preference on win32', async () => {
    setPlatform('win32')
    vi.mocked(isWindowsTerminalAvailable).mockReturnValue(true)

    await expect(openInPreferredTerminal(windowsTarget, 'terminal')).resolves.toEqual({
      ok: true,
      message: 'C:\\repo',
    })

    expect(openInWindowsTerminal).toHaveBeenCalledWith('C:\\repo')
    expect(openInAppleTerminal).not.toHaveBeenCalled()
  })

  test('coalesces concurrent duplicate Windows opens for the same normalized directory', async () => {
    setPlatform('win32')
    vi.mocked(isWindowsTerminalAvailable).mockReturnValue(true)
    let resolveOpen: ((result: { ok: true; message: string }) => void) | undefined
    vi.mocked(openInWindowsTerminal).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve
        }),
    )

    const first = openInPreferredTerminal(windowsTarget, 'terminal')
    const duplicate = openInPreferredTerminal(
      { ...windowsTarget, projectRoot: 'c:\\repo\\.', workingDirectory: 'c:\\repo\\.' },
      'terminal',
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(openInWindowsTerminal).toHaveBeenCalledTimes(1)

    resolveOpen?.({ ok: true, message: windowsTarget.workingDirectory })
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { ok: true, message: windowsTarget.workingDirectory },
      { ok: true, message: windowsTarget.workingDirectory },
    ])
  })

  test('reports terminal-not-installed on win32 when no Windows terminal is available', async () => {
    setPlatform('win32')
    vi.mocked(isWindowsTerminalAvailable).mockReturnValue(false)

    await expect(openInPreferredTerminal(windowsTarget, 'terminal')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(openInWindowsTerminal).not.toHaveBeenCalled()
  })

  test('opens remote Terminal.app explicitly on darwin when detection reports available', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openRemoteInPreferredTerminal(remoteTarget, 'terminal')).resolves.toEqual({
      ok: true,
      message: 'prod:/srv/repo-feature',
    })

    expect(openRemoteInAppleTerminal).toHaveBeenCalledWith(remoteTarget, {})
    expect(openRemoteInGhostty).not.toHaveBeenCalled()
  })

  test('prefers remote Ghostty in auto mode when it is installed', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(true)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(true)

    await expect(openRemoteInPreferredTerminal(remoteTarget, 'auto')).resolves.toEqual({
      ok: true,
      message: 'prod:/srv/repo-feature',
    })

    expect(openRemoteInGhostty).toHaveBeenCalledWith(remoteTarget, {})
    expect(openRemoteInAppleTerminal).not.toHaveBeenCalled()
  })

  test('returns terminal-not-installed for remote open when no terminal is available', async () => {
    vi.mocked(isGhosttyInstalled).mockReturnValue(false)
    vi.mocked(isAppleTerminalInstalled).mockResolvedValue(false)

    await expect(openRemoteInPreferredTerminal(remoteTarget, 'auto')).resolves.toEqual({
      ok: false,
      message: 'error.terminal-not-installed',
    })

    expect(openRemoteInGhostty).not.toHaveBeenCalled()
    expect(openRemoteInAppleTerminal).not.toHaveBeenCalled()
  })

  test('returns remote-terminal-not-supported for backends without remote support', async () => {
    await expect(
      openRemoteInTerminalBackend(
        {
          isInstalled: () => true,
          open: async (target) => ({ ok: true, message: target.workingDirectory }),
        },
        remoteTarget,
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'error.remote-terminal-not-supported',
    })
  })
})
