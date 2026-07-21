import { describe, expect, test } from 'vitest'
import { normalizeBranchWorkspacePlanRequest } from '#/shared/branch-workspaces.ts'

describe('branch workspace contracts', () => {
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
      'upstream removal without local removal',
      {
        operation: 'remove',
        branchWorkspaceId: 'workspace-1',
        alsoDeleteBranch: false,
        alsoDeleteUpstream: true,
      },
    ],
  ])('rejects %s', (_label, request) => {
    expect(normalizeBranchWorkspacePlanRequest(request)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
