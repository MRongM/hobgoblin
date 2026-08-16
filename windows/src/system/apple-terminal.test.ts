import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildTmuxSessionName } from '#/system/tmux-session.ts'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({
  statSync: mocks.statSync,
}))

const REMOTE_TARGET = {
  alias: 'prod',
  projectRoot: '/srv/repo',
  workingDirectory: '/srv/repo-feature',
  terminalNumber: 1,
}

describe('Apple Terminal integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.statSync.mockReturnValue({ isDirectory: () => true })
    mocks.execa.mockResolvedValue({})
  })

  test('opens a local tmux terminal using the shared terminal-1 identity', async () => {
    const { openInAppleTerminal } = await import('#/system/apple-terminal.ts')

    await expect(
      openInAppleTerminal(
        {
          projectRoot: '/srv/projects/example',
          workingDirectory: '/srv/projects/example/worktrees/feature',
          terminalNumber: 1,
        },
        { useTmux: true },
      ),
    ).resolves.toEqual({ ok: true, message: '/srv/projects/example/worktrees/feature' })

    const command = mocks.execa.mock.calls[0]![1][2]
    expect(command).toContain('new-session -d')
    expect(command).toContain('Use New terminal (Native).')
    expect(command).toContain('hobgoblin-v1-aebf050981ac829e36100020')
    expect(command).not.toContain("-s 'goblin-")
  })

  test('opens an existing ordinary default-server session without creating it', async () => {
    const { openInAppleTerminal } = await import('#/system/apple-terminal.ts')
    mocks.statSync.mockImplementationOnce(() => {
      throw new Error('directory no longer exists')
    })

    await expect(
      openInAppleTerminal(
        {
          projectRoot: '/srv/editor',
          workingDirectory: '/srv/editor',
          terminalNumber: 1,
        },
        {
          useTmux: true,
          existingTmuxSessionKind: 'default',
          existingTmuxSessionName: "editor's work",
        },
      ),
    ).resolves.toEqual({ ok: true, message: '/srv/editor' })

    const command = mocks.execa.mock.calls[0]![1][2]
    expect(command).toContain('tmux -L')
    expect(command).toContain('attach-session -t')
    expect(command).toContain('editor')
    expect(command).toContain('s work')
    expect(command).not.toContain('new-session')
  })

  test('opens Terminal.app with a prepared ssh command', async () => {
    const { openRemoteInAppleTerminal } = await import('#/system/apple-terminal.ts')

    await expect(openRemoteInAppleTerminal(REMOTE_TARGET)).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      ['-e', expect.stringContaining('tell application "Terminal"'), expect.stringContaining('ssh')],
      expect.objectContaining({ timeout: 10_000, forceKillAfterDelay: 500 }),
    )
    expect(mocks.execa.mock.calls[0]![1][2]).toContain('prod')
    expect(mocks.execa.mock.calls[0]![1][2]).toContain('/srv/repo-feature')
    expect(mocks.execa.mock.calls[0]![1][2]).not.toContain('tmux')
  })

  test('opens a remote tmux terminal using the same endpoint-independent identity', async () => {
    const { openRemoteInAppleTerminal } = await import('#/system/apple-terminal.ts')

    await expect(openRemoteInAppleTerminal(REMOTE_TARGET, { useTmux: true })).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    const command = mocks.execa.mock.calls[0]![1][2]
    expect(command).toContain('new-session -d')
    expect(command).toContain('Use New terminal (Native).')
    expect(command).toContain(buildTmuxSessionName(REMOTE_TARGET)!)
    expect(command).not.toContain('detach')
    expect(command).not.toContain('alice@example.com')
  })

  test('rejects invalid remote inputs before invoking osascript', async () => {
    const { openRemoteInAppleTerminal } = await import('#/system/apple-terminal.ts')

    await expect(openRemoteInAppleTerminal({ ...REMOTE_TARGET, alias: 'bad alias' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(openRemoteInAppleTerminal({ ...REMOTE_TARGET, workingDirectory: 'relative/repo' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })
})
