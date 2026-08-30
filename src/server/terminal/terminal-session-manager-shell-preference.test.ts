import { beforeEach, expect, test, vi } from 'vitest'
import { TerminalSessionManager } from '#/server/terminal/terminal-session-manager.ts'

const { spawnTerminalPtyRuntimeMock } = vi.hoisted(() => ({
  spawnTerminalPtyRuntimeMock: vi.fn(),
}))

vi.mock('#/server/terminal/terminal-pty-runtime.ts', () => ({
  spawnTerminalPtyRuntime: spawnTerminalPtyRuntimeMock,
}))

beforeEach(() => {
  spawnTerminalPtyRuntimeMock.mockReset()
  spawnTerminalPtyRuntimeMock.mockImplementation(() => ({
    ok: true as const,
    runtime: {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onExit: vi.fn(() => ({ dispose: vi.fn() })),
      processName: vi.fn(() => 'shell.exe'),
    },
  }))
})

test('uses the latest Windows shell preference only when creating or restarting a PTY', () => {
  const manager = new TerminalSessionManager<string>({ onOutput: vi.fn(), onExit: vi.fn() })
  manager.setWindowsInternalTerminalShellPreference('wsl')

  const created = manager.ensureSession({
    ownerId: 'client_a',
    scope: 'C:\\workspace',
    key: 'C:\\workspace\0C:\\workspace\\feature\0terminal-1',
    cwd: 'C:\\workspace\\feature',
    cols: 80,
    rows: 24,
    attachmentId: 'attachment_a',
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return
  expect(spawnTerminalPtyRuntimeMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ windowsInternalTerminalShell: 'wsl' }),
  )

  manager.setWindowsInternalTerminalShellPreference('cmd')
  expect(spawnTerminalPtyRuntimeMock).toHaveBeenCalledTimes(1)

  const restarted = manager.restartSession('client_a', created.sessionId, 100, 30, 'attachment_a', true)
  expect(restarted.ok).toBe(true)
  expect(spawnTerminalPtyRuntimeMock).toHaveBeenCalledTimes(2)
  expect(spawnTerminalPtyRuntimeMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ windowsInternalTerminalShell: 'cmd' }),
  )
})
