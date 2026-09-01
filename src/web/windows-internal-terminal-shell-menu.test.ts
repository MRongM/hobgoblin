import { beforeEach, expect, test, vi } from 'vitest'
import { supportsWindowsInternalTerminalShellMenu } from '#/web/windows-internal-terminal-shell-menu.ts'

const platformState = vi.hoisted(() => ({ hostPlatform: 'linux' as NodeJS.Platform }))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: platformState.hostPlatform }),
}))

beforeEach(() => {
  platformState.hostPlatform = 'linux'
})

test('supports explicit shell menus only for native local repositories on Windows', () => {
  expect(supportsWindowsInternalTerminalShellMenu('/workspace/repo')).toBe(false)

  platformState.hostPlatform = 'win32'
  expect(supportsWindowsInternalTerminalShellMenu('C:\\workspace\\repo')).toBe(true)
  expect(supportsWindowsInternalTerminalShellMenu('wsl://Ubuntu/home/example/repo')).toBe(false)
  expect(supportsWindowsInternalTerminalShellMenu('ssh-config://example/srv/repo')).toBe(false)
})
