import { describe, expect, test } from 'vitest'
import { buildManagedLocalTerminalInvocation } from '#/system/local-terminal.ts'
import { TMUX_TERMINAL_NUMBER_OPTION } from '#/system/tmux-session.ts'

const TARGET = {
  projectRoot: '/srv/projects/example',
  workingDirectory: '/srv/projects/example/worktrees/feature',
  terminalNumber: 1,
}

describe('buildManagedLocalTerminalInvocation', () => {
  test('builds a tmux-first local shell invocation when enabled on POSIX', () => {
    const invocation = buildManagedLocalTerminalInvocation(TARGET, {
      useTmux: true,
      platform: 'darwin',
      fallbackShell: '/bin/zsh',
    })

    expect(invocation).toMatchObject({ command: '/bin/zsh', args: ['-lc', expect.any(String)] })
    expect(invocation?.tmuxSessionName).toBe('hobgoblin-v1-aebf050981ac829e36100020')
    expect(invocation?.script).toContain('command -v tmux >/dev/null 2>&1')
    expect(invocation?.script).toContain(
      "exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain("set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on")
    expect(invocation?.script).not.toContain('set-option -g')
    expect(invocation?.script).toContain("exec '/bin/zsh' -l")
    expect(invocation?.shellCommand).toContain("'/bin/zsh' '-lc'")
    expect(invocation?.script).not.toContain("-s 'goblin-")
  })

  test('defaults to zsh as the macOS login-shell wrapper', () => {
    const previousShell = process.env.SHELL
    delete process.env.SHELL

    try {
      const invocation = buildManagedLocalTerminalInvocation(TARGET, {
        useTmux: true,
        platform: 'darwin',
      })

      expect(invocation).toMatchObject({ command: '/bin/zsh', args: ['-lc', expect.any(String)] })
      expect(invocation?.script).toContain("exec '/bin/zsh' -l")
    } finally {
      if (previousShell === undefined) delete process.env.SHELL
      else process.env.SHELL = previousShell
    }
  })

  test('returns null when tmux is disabled or the platform is Windows', () => {
    expect(buildManagedLocalTerminalInvocation(TARGET, { useTmux: false, platform: 'darwin' })).toBeNull()
    expect(buildManagedLocalTerminalInvocation(TARGET, { useTmux: true, platform: 'win32' })).toBeNull()
  })

  test('attaches an existing tmux session by exact name without creating another session', () => {
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    const invocation = buildManagedLocalTerminalInvocation(
      { ...TARGET, terminalNumber: 2 },
      {
        useTmux: true,
        existingTmuxSessionName: sessionName,
        platform: 'darwin',
        fallbackShell: '/bin/zsh',
      },
    )

    expect(invocation?.tmuxSessionName).toBe(sessionName)
    expect(invocation?.script).toContain(`exec tmux attach-session -t '=${sessionName}'`)
    expect(invocation?.script).not.toContain('tmux new-session')
    expect(invocation?.script).not.toContain(TMUX_TERMINAL_NUMBER_OPTION)
  })

  test('attaches a recovered session through its validated project server', () => {
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    const serverName = 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0'
    const invocation = buildManagedLocalTerminalInvocation(TARGET, {
      useTmux: true,
      existingTmuxSessionName: sessionName,
      existingTmuxServerName: serverName,
      platform: 'darwin',
      fallbackShell: '/bin/zsh',
    })

    expect(invocation?.script).toContain(`exec tmux -L '${serverName}' attach-session -t '=${sessionName}'`)
    expect(
      buildManagedLocalTerminalInvocation(TARGET, {
        useTmux: true,
        existingTmuxSessionName: sessionName,
        existingTmuxServerName: 'hobgoblin-project-v1-0123456789abcdef01234567',
        platform: 'darwin',
      }),
    ).toBeNull()
  })

  test('quotes apostrophes in working directories and fallback shells', () => {
    const invocation = buildManagedLocalTerminalInvocation(
      { ...TARGET, workingDirectory: "/srv/user's feature" },
      { useTmux: true, platform: 'linux', fallbackShell: "/opt/user's shell" },
    )

    expect(invocation?.script).toContain("-c '/srv/user'\\''s feature'")
    expect(invocation?.script).toContain("@hobgoblin_init_path '/srv/user'\\''s feature'")
    expect(invocation?.script).toContain("exec '/opt/user'\\''s shell' -l")
  })

  test('rejects an invalid tmux descriptor', () => {
    expect(
      buildManagedLocalTerminalInvocation(
        { ...TARGET, workingDirectory: 'relative/path' },
        { useTmux: true, platform: 'darwin' },
      ),
    ).toBeNull()
  })
})
