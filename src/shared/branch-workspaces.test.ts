import { describe, expect, test } from 'vitest'
import { isBranchWorkspaceApproval, normalizeBranchWorkspacePlanRequest } from '#/shared/branch-workspaces.ts'

describe('branch workspace contracts', () => {
  test('rejects retired dependency recovery approvals without accepting broader overwrite intent', () => {
    expect(isBranchWorkspaceApproval('replace-repository-dependencies')).toBe(false)
    expect(isBranchWorkspaceApproval('discard-member-changes')).toBe(true)
    expect(isBranchWorkspaceApproval('replace-everything')).toBe(false)
  })

  test('normalizes create requests while preserving repository and auxiliary order', () => {
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'create',
        branch: ' feature/auth ',
        repositories: [
          {
            repositoryName: 'web',
            creationBase: { kind: 'localBranch', branch: ' main ' },
            syncBeforeCreate: true,
          },
          {
            repositoryName: 'api',
            creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [
          { name: 'README.md', mode: 'symlink' },
          { name: 'docs', mode: 'copy' },
        ],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'web',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: true,
          },
          {
            repositoryName: 'api',
            creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [
          { name: 'README.md', mode: 'symlink' },
          { name: 'docs', mode: 'copy' },
        ],
      },
    })
  })

  test('normalizes legacy base branches without enabling synchronization', () => {
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
        auxiliaryEntries: [],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
          },
        ],
        auxiliaryEntries: [],
      },
    })
  })

  test('preserves a normalized repository dependency source for authoritative server validation', () => {
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: true,
            worktreeBootstrap: {
              kind: 'materialize',
              sourceWorktreePath: '/untrusted/client/path',
              selections: [
                { path: 'backend/.venv', mode: 'symlink' },
                { path: '../invalid', mode: 'copy' },
              ],
            },
          },
        ],
        auxiliaryEntries: [],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: true,
            worktreeBootstrap: {
              kind: 'materialize',
              selections: [{ path: 'backend/.venv', mode: 'symlink' }],
              sourceWorktreePath: '/untrusted/client/path',
            },
          },
        ],
        auxiliaryEntries: [],
      },
    })
  })

  test('downgrades a malformed repository dependency source path to skip', () => {
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            baseBranch: 'main',
            worktreeBootstrap: {
              kind: 'materialize',
              sourceWorktreePath: 'relative/path',
              selections: [{ path: 'node_modules', mode: 'symlink' }],
            },
          },
        ],
        auxiliaryEntries: [],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
            worktreeBootstrap: { kind: 'skip' },
          },
        ],
        auxiliaryEntries: [],
      },
    })
  })

  test('downgrades unsupported or empty repository dependency decisions to skip', () => {
    for (const worktreeBootstrap of [
      { kind: 'run', configHash: 'sha256:client', configTrusted: false },
      {
        kind: 'materialize',
        sourceWorktreePath: '/repo',
        selections: [{ path: '../invalid', mode: 'copy' }],
      },
    ]) {
      const result = normalizeBranchWorkspacePlanRequest({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [{ repositoryName: 'api', baseBranch: 'main', worktreeBootstrap }],
        auxiliaryEntries: [],
      })
      expect(result).toMatchObject({
        ok: true,
        request: {
          repositories: [{ worktreeBootstrap: { kind: 'skip' } }],
        },
      })
    }
  })

  test('normalizes repair and remove requests as distinct operations', () => {
    expect(normalizeBranchWorkspacePlanRequest({ operation: 'repair', branchWorkspaceId: ' workspace-1 ' })).toEqual({
      ok: true,
      request: { operation: 'repair', branchWorkspaceId: 'workspace-1' },
    })
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'remove',
        branchWorkspaceId: 'workspace-1',
        alsoDeleteBranch: true,
        alsoDeleteUpstream: false,
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'remove',
        branchWorkspaceId: 'workspace-1',
        alsoDeleteBranch: true,
        alsoDeleteUpstream: false,
      },
    })
  })

  test('normalizes member reduction requests while preserving selected repository order', () => {
    expect(
      normalizeBranchWorkspacePlanRequest({
        operation: 'reduce',
        branchWorkspaceId: ' workspace-1 ',
        repositories: [' web ', 'api'],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'reduce',
        branchWorkspaceId: 'workspace-1',
        repositories: ['web', 'api'],
      },
    })
  })

  test.each([
    ['unknown operation', { operation: 'move' }],
    [
      'empty repository selection',
      { operation: 'create', branch: 'feature/auth', repositories: [], auxiliaryEntries: [] },
    ],
    [
      'duplicate repository selection',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          { repositoryName: 'api', baseBranch: 'main' },
          { repositoryName: 'api', baseBranch: 'release' },
        ],
        auxiliaryEntries: [],
      },
    ],
    [
      'unsafe auxiliary name',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
        auxiliaryEntries: [{ name: '../secret', mode: 'copy' }],
      },
    ],
    [
      'invalid auxiliary mode',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [{ repositoryName: 'api', baseBranch: 'main' }],
        auxiliaryEntries: [{ name: 'README.md', mode: 'move' }],
      },
    ],
    [
      'invalid remote creation base',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'remoteBranch', remoteRef: 'origin/HEAD' },
            syncBeforeCreate: true,
          },
        ],
        auxiliaryEntries: [],
      },
    ],
    [
      'invalid synchronization intent',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: 'yes',
          },
        ],
        auxiliaryEntries: [],
      },
    ],
    [
      'upstream removal without local removal',
      {
        operation: 'remove',
        branchWorkspaceId: 'workspace-1',
        alsoDeleteBranch: false,
        alsoDeleteUpstream: true,
      },
    ],
    ['empty member reduction', { operation: 'reduce', branchWorkspaceId: 'workspace-1', repositories: [] }],
    [
      'duplicate member reduction',
      { operation: 'reduce', branchWorkspaceId: 'workspace-1', repositories: ['api', 'api'] },
    ],
    [
      'unsafe member reduction name',
      { operation: 'reduce', branchWorkspaceId: 'workspace-1', repositories: ['../api'] },
    ],
    ['non-array member reduction', { operation: 'reduce', branchWorkspaceId: 'workspace-1', repositories: 'api' }],
  ])('rejects %s', (_label, request) => {
    expect(normalizeBranchWorkspacePlanRequest(request)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
