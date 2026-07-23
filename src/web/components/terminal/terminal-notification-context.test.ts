// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import type { TerminalDescriptor, TerminalBellEvent } from '#/web/components/terminal/types.ts'
import { terminalNotificationContext } from '#/web/components/terminal/terminal-notification-context.ts'

const event: TerminalBellEvent = { processName: 'bun', canonicalTitle: 'bun run test', visible: false }

function descriptor(overrides: Partial<TerminalDescriptor> = {}): TerminalDescriptor {
  return {
    key: 'terminal-key',
    worktreeTerminalKey: 'worktree-key',
    terminalId: 'terminal-2',
    index: 2,
    repoRoot: '/Users/tester/src/api',
    branch: 'feature/login',
    worktreePath: '/Users/tester/src/api-feature-login',
    ...overrides,
  }
}

const localRepo = {
  id: '/Users/tester/src/api',
  name: 'api',
  isGitRepo: true,
  remote: {},
}

vi.mock('#/web/app-shell-client.ts', () => ({ homeDirectory: () => '/Users/tester' }))

describe('terminalNotificationContext', () => {
  test('describes a local linked worktree with a tildified path', () => {
    expect(terminalNotificationContext(descriptor(), event, { [localRepo.id]: localRepo })).toEqual({
      terminalKey: 'terminal-key',
      project: 'api',
      contextKind: 'worktree',
      context: 'api-feature-login',
      directory: '~/src/api-feature-login',
      branch: 'feature/login',
      terminalIndex: 2,
      terminalTitle: 'bun run test',
    })
  })

  test('includes the triggering terminal output tail', () => {
    expect(
      terminalNotificationContext(descriptor(), { ...event, outputTail: 'tests passed\nready' }, { [localRepo.id]: localRepo }),
    ).toMatchObject({ outputTail: 'tests passed\nready' })
  })

  test('describes plain workspaces without a branch', () => {
    const root = '/Users/tester/src/platform'
    expect(
      terminalNotificationContext(descriptor({ repoRoot: root, worktreePath: root, branch: '' }), event, {
        [root]: { id: root, name: 'platform', isGitRepo: false, remote: {} },
      }),
    ).toMatchObject({
      project: 'platform',
      contextKind: 'workspace',
      context: 'platform',
      directory: '~/src/platform',
    })
    expect(
      terminalNotificationContext(descriptor({ repoRoot: root, worktreePath: root, branch: '' }), event, {
        [root]: { id: root, name: 'platform', isGitRepo: false, remote: {} },
      }),
    ).not.toHaveProperty('branch')
  })

  test('classifies branch workspaces before linked worktrees', () => {
    const root = '/Users/tester/src/platform'
    const branchWorkspace = descriptor({
      repoRoot: root,
      worktreePath: '/Users/tester/src/platform-feature-login',
      targetKind: 'branch-workspace',
      branchWorkspaceId: 'branch-workspace-1',
    })
    expect(
      terminalNotificationContext(branchWorkspace, event, {
        [root]: { id: root, name: 'platform', isGitRepo: false, remote: {} },
      }),
    ).toMatchObject({
      project: 'platform',
      contextKind: 'branch-workspace',
      context: 'platform-feature-login',
      branch: 'feature/login',
    })
  })

  test('uses a workspace member as the project and the owning workspace as context', () => {
    const root = '/Users/tester/src/platform'
    const member = `${root}/api`
    expect(
      terminalNotificationContext(descriptor({ repoRoot: member, worktreePath: member, branch: 'main' }), event, {
        [root]: { id: root, name: 'platform', isGitRepo: false, remote: {} },
        [member]: { id: member, name: 'api', workspaceRootId: root, isGitRepo: true, remote: {} },
      }),
    ).toMatchObject({
      project: 'api',
      contextKind: 'workspace',
      context: 'platform',
      directory: '~/src/platform/api',
    })
  })

  test('uses the SSH alias for remote paths', () => {
    const target: RemoteRepoTarget = {
      id: 'remote-id',
      alias: 'dev',
      remotePath: '/srv/api',
      displayName: 'dev:/srv/api',
      host: 'example.test',
      user: 'developer',
      port: 22,
    }
    expect(
      terminalNotificationContext(descriptor({ repoRoot: '/srv/api', worktreePath: '/srv/api-feature-login' }), event, {
        '/srv/api': { id: '/srv/api', name: 'api', isGitRepo: true, remote: { target } },
      }),
    ).toMatchObject({ directory: 'dev:/srv/api-feature-login' })
  })
})
