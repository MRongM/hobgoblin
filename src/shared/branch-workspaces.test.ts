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
          { repositoryName: 'web', baseBranch: ' main ' },
          { repositoryName: 'api', baseBranch: 'release' },
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
          { repositoryName: 'web', baseBranch: 'main' },
          { repositoryName: 'api', baseBranch: 'release' },
        ],
        auxiliaryEntries: [
          { name: 'README.md', mode: 'symlink' },
          { name: 'docs', mode: 'copy' },
        ],
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
            baseBranch: 'main',
            worktreeBootstrap: {
              kind: 'materialize',
              sourceWorktreePath: '/untrusted/client/path',
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
            baseBranch: 'main',
            worktreeBootstrap: {
              kind: 'materialize',
              candidateScope: 'all-untracked',
              selections: [{ path: 'node_modules', mode: 'symlink' }],
              sourceWorktreePath: '/untrusted/client/path',
            },
          },
        ],
        auxiliaryEntries: [],
      },
    })
  })

  test('rejects a malformed repository dependency source path', () => {
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
    ).toEqual({ ok: false, message: 'error.invalid-arguments' })
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
      'configured bootstrap decision supplied by a client',
      {
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            baseBranch: 'main',
            worktreeBootstrap: { kind: 'run', configHash: 'sha256:client', configTrusted: false },
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
