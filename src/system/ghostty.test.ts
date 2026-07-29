import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildTmuxSessionName } from '#/system/tmux-session.ts'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  existsSync: vi.fn(),
  homedir: vi.fn(() => '/Users/test'),
}))

vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}))
vi.mock('node:os', () => ({ default: { homedir: mocks.homedir } }))

function childProcessPromise() {
  const child = Promise.resolve({}) as Promise<unknown> & { unref: ReturnType<typeof vi.fn> }
  child.unref = vi.fn()
  return child
}

const REMOTE_TARGET = {
  alias: 'prod',
  projectRoot: '/srv/repo',
  workingDirectory: '/srv/repo-feature',
  terminalNumber: 1,
}

describe('Ghostty integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockImplementation((path: string) => path === '/Applications/Ghostty.app')
    mocks.execa.mockReturnValue(childProcessPromise())
  })

  test('opens a local tmux command in a running Ghostty window', async () => {
    const { openInGhostty } = await import('#/system/ghostty.ts')
    mocks.execa.mockResolvedValueOnce({ stdout: 'opened' })

    await expect(
      openInGhostty(
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
  })

  test('opens a remote command in a running Ghostty window', async () => {
    const { openRemoteInGhostty } = await import('#/system/ghostty.ts')
    mocks.execa.mockResolvedValueOnce({ stdout: 'opened' })

    await expect(openRemoteInGhostty(REMOTE_TARGET)).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      ['-e', expect.stringContaining('input text'), expect.stringContaining('sh -lc')],
      expect.objectContaining({ timeout: 5_000, forceKillAfterDelay: 500 }),
    )
    expect(mocks.execa.mock.calls[0]![1][2]).toContain('prod')
    expect(mocks.execa.mock.calls[0]![1][2]).toContain('/srv/repo-feature')
    expect(mocks.execa.mock.calls[0]![1][2]).not.toContain('tmux')
  })

  test('passes the remote tmux attach/create command to a running Ghostty window', async () => {
    const { openRemoteInGhostty } = await import('#/system/ghostty.ts')
    mocks.execa.mockResolvedValueOnce({ stdout: 'opened' })

    await expect(openRemoteInGhostty(REMOTE_TARGET, { useTmux: true })).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    const command = mocks.execa.mock.calls[0]![1][2]
    expect(command).toContain('new-session -d')
    expect(command).toContain('Use New terminal (Native).')
    expect(command).toContain(buildTmuxSessionName(REMOTE_TARGET)!)
    expect(command).not.toContain('detach')
  })

  test('cold-starts Ghostty with ssh as the initial command when it is not running', async () => {
    const { openRemoteInGhostty } = await import('#/system/ghostty.ts')
    mocks.execa.mockResolvedValueOnce({ stdout: 'not-running' })
    mocks.execa.mockReturnValueOnce(childProcessPromise())

    await expect(openRemoteInGhostty(REMOTE_TARGET)).resolves.toEqual({
      ok: true,
      message: '/srv/repo-feature',
    })

    expect(mocks.execa).toHaveBeenLastCalledWith(
      'open',
      ['-na', 'Ghostty.app', '--args', '-e', 'ssh', '-tt', '--', 'prod', expect.stringContaining('sh -lc')],
      expect.objectContaining({ detached: true, stdio: 'ignore', cleanup: false }),
    )
    expect(mocks.execa.mock.calls[1]![1][8]).toContain('/srv/repo-feature')
    expect(mocks.execa.mock.calls[1]![1][8]).not.toContain('tmux')
  })

  test('rejects invalid remote inputs before launching Ghostty', async () => {
    const { openRemoteInGhostty } = await import('#/system/ghostty.ts')

    await expect(openRemoteInGhostty({ ...REMOTE_TARGET, alias: 'bad alias' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(openRemoteInGhostty({ ...REMOTE_TARGET, workingDirectory: 'relative/repo' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('returns ghostty-not-installed when Ghostty is unavailable', async () => {
    mocks.existsSync.mockReturnValue(false)
    const { openRemoteInGhostty } = await import('#/system/ghostty.ts')

    await expect(openRemoteInGhostty(REMOTE_TARGET)).resolves.toEqual({
      ok: false,
      message: 'error.ghostty-not-installed',
    })
  })
})
