import { describe, expect, test } from 'vitest'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { buildRemoteCommandInvocation } from '#/system/ssh/commands.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'server',
  host: 'example.com',
  user: 'developer',
  port: 22,
  remotePath: '/srv/repo',
})!

describe('remote worktree bootstrap candidate command', () => {
  test('asks git for ignored entries in ignored-only scope', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'worktreeBootstrapCandidates',
      sourceRoot: '/srv/repo',
      candidateScope: 'ignored-only',
    })

    expect(invocation.script).toContain(
      '"git", "-C", root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"',
    )
    expect(invocation.script).toContain('ignored_roots')
  })
})
