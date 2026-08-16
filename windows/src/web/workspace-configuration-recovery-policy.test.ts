import { describe, expect, test } from 'vitest'
import { workspaceConfigurationRecoveryAvailable } from '#/web/workspace-configuration-recovery-policy.ts'
import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'

function workspace(overrides: Partial<WorkspaceProjectState> = {}): WorkspaceProjectState {
  return {
    rootId: '/workspace',
    repositoryIds: ['/workspace/api'],
    candidates: [{ id: '/workspace/api', name: 'api', selected: true, available: true }],
    configured: true,
    configuredRepositoryNames: ['api'],
    configurationError: null,
    phase: 'ready',
    skipped: [],
    error: null,
    ...overrides,
  }
}

describe('workspaceConfigurationRecoveryAvailable', () => {
  test('offers recovery for invalid, missing, unavailable, and excluded configuration records', () => {
    expect(
      workspaceConfigurationRecoveryAvailable(workspace({ configurationError: 'workspace.config.read-failed' })),
    ).toBe(true)
    expect(workspaceConfigurationRecoveryAvailable(workspace({ configured: false }))).toBe(true)
    expect(
      workspaceConfigurationRecoveryAvailable(
        workspace({ candidates: [{ id: '/workspace/api', name: 'api', selected: true, available: false }] }),
      ),
    ).toBe(true)
    expect(
      workspaceConfigurationRecoveryAvailable(
        workspace({ configuredRepositoryNames: ['api', 'legacy-linked-worktree'] }),
      ),
    ).toBe(true)
    expect(workspaceConfigurationRecoveryAvailable(workspace({ error: 'workspace.config.write-failed' }))).toBe(true)
  })

  test('does not offer recovery for transient reads, skipped paths, healthy workspaces, or absent state', () => {
    expect(workspaceConfigurationRecoveryAvailable(workspace({ error: 'error.ssh-connection-failed' }))).toBe(false)
    expect(
      workspaceConfigurationRecoveryAvailable(
        workspace({ skipped: [{ path: '/workspace/broken', message: 'error.failed-read-repo' }] }),
      ),
    ).toBe(false)
    expect(workspaceConfigurationRecoveryAvailable(workspace())).toBe(false)
    expect(workspaceConfigurationRecoveryAvailable(undefined)).toBe(false)
  })

  test('does not treat an empty unconfigured directory as configuration corruption', () => {
    expect(
      workspaceConfigurationRecoveryAvailable(
        workspace({ configured: false, repositoryIds: [], candidates: [], configuredRepositoryNames: undefined }),
      ),
    ).toBe(false)
  })
})
