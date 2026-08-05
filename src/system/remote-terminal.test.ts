import { describe, expect, test } from 'vitest'
import {
  buildExternalRemoteTerminalInvocation,
  buildManagedRemoteTerminalInvocation,
} from '#/system/remote-terminal.ts'
import { TMUX_TERMINAL_NUMBER_OPTION } from '#/system/tmux-session.ts'

const BASE_MANAGED_TARGET = {
  alias: 'prod',
  projectRoot: '/srv/projects/example',
  workingDirectory: '/srv/projects/example/worktrees/feature',
  terminalNumber: 1,
}

describe('buildManagedRemoteTerminalInvocation', () => {
  test('builds a plain ssh invocation by default', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET)

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/projects/example/worktrees/feature' || exit")
    expect(invocation?.script).toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation?.script).not.toContain('tmux')
    expect(invocation?.shellCommand).not.toContain('tmux')
    expect(invocation?.tmuxSessionName).toBeNull()
  })

  test('builds a strict tmux ssh invocation without native fallback when enabled', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, { useTmux: true })

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/projects/example/worktrees/feature' || exit")
    expect(invocation?.script).toContain('command -v tmux >/dev/null 2>&1')
    expect(invocation?.script).toContain(
      "new-session -d -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain("set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on")
    expect(invocation?.script).not.toContain('set-option -g')
    expect(invocation?.script).toContain('Use New terminal (Native).')
    expect(invocation?.script).toContain('exit 127')
    expect(invocation?.script).toContain('exit "$tmux_status"')
    expect(invocation?.script).not.toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation?.script).not.toContain('\\;')
    expect(invocation?.shellCommand).toContain('ssh')
    expect(invocation?.shellCommand).toContain('prod')
    expect(invocation?.shellCommand).toContain('tmux')
    expect(invocation?.tmuxSessionName).toBe('hobgoblin-v1-aebf050981ac829e36100020')
  })

  test('includes caller-provided ssh options before the destination', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
      sshOptions: ['-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10'],
    })

    expect(invocation?.args.slice(0, 7)).toEqual([
      '-tt',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '--',
      'prod',
    ])
  })

  test('attaches an existing remote tmux session by exact name without creating another session', () => {
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    const invocation = buildManagedRemoteTerminalInvocation(
      { ...BASE_MANAGED_TARGET, terminalNumber: 2 },
      { useTmux: true, existingTmuxSessionName: sessionName },
    )

    expect(invocation?.tmuxSessionName).toBe(sessionName)
    expect(invocation?.script).toContain(`tmux attach-session -t '=${sessionName}'`)
    expect(invocation?.script).not.toContain('tmux new-session')
    expect(invocation?.script).not.toContain(TMUX_TERMINAL_NUMBER_OPTION)
  })

  test('attaches a recovered remote session through its validated project server', () => {
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    const serverName = 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0'
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
      useTmux: true,
      existingTmuxSessionName: sessionName,
      existingTmuxServerName: serverName,
    })

    expect(invocation?.script).toContain(`tmux -L '${serverName}' attach-session -t '=${sessionName}'`)
    expect(
      buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
        useTmux: true,
        existingTmuxSessionName: sessionName,
        existingTmuxServerName: 'hobgoblin-project-v1-0123456789abcdef01234567',
      }),
    ).toBeNull()
  })

  test('attaches an ordinary remote default-server session by its opaque exact name', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
      useTmux: true,
      existingTmuxSessionKind: 'default',
      existingTmuxSessionName: "editor's work",
    })

    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("tmux -L 'default' attach-session -t '=editor'\\''s work'")
    expect(invocation?.script).not.toContain("cd '/srv/projects/example/worktrees/feature'")
    expect(invocation?.script).not.toContain('new-session')
    expect(invocation?.script).not.toContain('set-option')
    expect(
      buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
        useTmux: true,
        existingTmuxSessionKind: 'default',
        existingTmuxSessionName: 'editor',
        existingTmuxServerName: 'hobgoblin-project-v1-0123456789abcdef01234567',
      }),
    ).toBeNull()
  })

  test('attaches a remote host-inventory session through its exact named server', () => {
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    const serverName = 'hobgoblin-project-v1-0123456789abcdef01234567'
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
      useTmux: true,
      existingTmuxSessionKind: 'hobgoblin',
      existingTmuxSessionName: sessionName,
      existingTmuxServerName: serverName,
    })

    expect(invocation?.script).toContain(`tmux -L '${serverName}' attach-session -t '=${sessionName}'`)
    expect(invocation?.script).not.toContain('new-session')
    expect(
      buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
        useTmux: true,
        existingTmuxSessionKind: 'hobgoblin',
        existingTmuxSessionName: 'ordinary',
        existingTmuxServerName: serverName,
      }),
    ).toBeNull()
  })

  test('shell-quotes remote paths that contain single quotes', () => {
    const invocation = buildManagedRemoteTerminalInvocation(
      {
        ...BASE_MANAGED_TARGET,
        workingDirectory: "/srv/repo's-feature",
      },
      { useTmux: true },
    )

    expect(invocation).not.toBeNull()
    expect(invocation?.script).toContain("cd '/srv/repo'\\''s-feature' || exit")
    expect(invocation?.script).toContain("-c '/srv/repo'\\''s-feature'")
    expect(invocation?.script).toContain("@hobgoblin_init_path '/srv/repo'\\''s-feature'")
  })

  test('keeps non-ascii paths as quoted shell data', () => {
    const invocation = buildManagedRemoteTerminalInvocation({
      ...BASE_MANAGED_TARGET,
      projectRoot: '/srv/\u9879\u76ee',
      workingDirectory: '/srv/\u9879\u76ee/\u529f\u80fd',
    })

    expect(invocation?.script).toContain("cd '/srv/\u9879\u76ee/\u529f\u80fd' || exit")
  })

  test('rejects unsafe managed target input', () => {
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, alias: 'bad alias' })).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, projectRoot: 'relative/repo' })).toBeNull()
    expect(
      buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, workingDirectory: 'relative/repo' }),
    ).toBeNull()
    expect(
      buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, workingDirectory: '/srv/\u0000repo' }),
    ).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, terminalNumber: 0 })).toBeNull()
  })
})

describe('buildExternalRemoteTerminalInvocation', () => {
  test('builds a tmux-aware external ssh invocation when enabled', () => {
    const invocation = buildExternalRemoteTerminalInvocation(
      {
        alias: 'prod',
        projectRoot: '/srv/projects/example',
        workingDirectory: '/srv/projects/example/worktrees/feature',
        terminalNumber: 1,
      },
      { useTmux: true },
    )

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/projects/example/worktrees/feature' || exit")
    expect(invocation?.script).toContain("-s 'hobgoblin-v1-aebf050981ac829e36100020'")
    expect(invocation?.script).not.toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation?.script).toContain('tmux')
    expect(invocation?.shellCommand).toContain('tmux')
  })

  test('rejects unsafe external target input', () => {
    expect(buildExternalRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, alias: 'bad alias' })).toBeNull()
    expect(
      buildExternalRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, workingDirectory: 'relative/repo' }),
    ).toBeNull()
    expect(
      buildExternalRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, workingDirectory: '/srv/\u0000repo' }),
    ).toBeNull()
  })
})
