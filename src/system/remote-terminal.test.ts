import { describe, expect, test } from 'vitest'
import {
  buildExternalRemoteTerminalInvocation,
  buildManagedRemoteTerminalInvocation,
} from '#/system/remote-terminal.ts'

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

  test('builds a tmux-first ssh invocation with native shell fallback when enabled', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, { useTmux: true })

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/projects/example/worktrees/feature' || exit")
    expect(invocation?.script).toContain('command -v tmux >/dev/null 2>&1')
    expect(invocation?.script).toContain(
      "exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain(
      "exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature' \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.script).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'",
    )
    expect(invocation?.script).not.toContain('set-option -g')
    expect(invocation?.script).toContain('exec "${SHELL:-/bin/sh}" -l')
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
    expect(invocation?.script).toContain('exec "${SHELL:-/bin/sh}" -l')
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
