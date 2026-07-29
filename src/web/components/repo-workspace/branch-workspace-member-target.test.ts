import { describe, expect, test } from 'vitest'
import type { BranchWorkspaceRepositorySnapshot } from '#/shared/branch-workspaces.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'
import { resolveBranchWorkspaceMemberTarget } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'

const repositoryId = '/workspace/api'
const worktreePath = '/workspace/goblin-feature-auth/api'

function member(overrides: Partial<BranchWorkspaceRepositorySnapshot> = {}): BranchWorkspaceRepositorySnapshot {
  return {
    repositoryName: 'api',
    targetBranch: 'feature/auth',
    baseBranch: 'main',
    branchOrigin: 'created',
    worktreePath,
    progress: 'complete',
    ready: true,
    ...overrides,
  }
}

function repository(options: { available?: boolean; branch?: string; path?: string } = {}) {
  return replaceRepo(emptyRepo(repositoryId, 'api'), (repo) => {
    repo.availability =
      options.available === false ? { phase: 'unavailable', reason: 'missing', checkedAt: 1 } : { phase: 'available' }
    repo.data.branches = [
      createRepoBranch(options.branch ?? 'feature/auth', {
        worktree: { path: options.path ?? worktreePath },
      }),
    ]
  })
}

function resolve(
  targetMember: BranchWorkspaceRepositorySnapshot,
  options: { configured?: boolean; repo?: ReturnType<typeof repository> } = {},
) {
  return resolveBranchWorkspaceMemberTarget({
    member: targetMember,
    repositoryIds: options.configured === false ? [] : [repositoryId],
    candidates: [{ id: repositoryId, name: 'api', selected: true, available: true }],
    repos: { [repositoryId]: options.repo ?? repository() },
  })
}

describe('resolveBranchWorkspaceMemberTarget', () => {
  test('returns the stable member target when repository, branch, and worktree agree', () => {
    expect(resolve(member())).toEqual({
      ok: true,
      target: {
        repositoryId,
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        checkedOutBranch: 'feature/auth',
        worktreePath,
      },
    })
  })

  test('rejects a member that is not configured in the workspace', () => {
    expect(resolve(member(), { configured: false })).toEqual({
      ok: false,
      reason: 'workspace.branch-workspace.member-unconfigured',
    })
  })

  test('rejects an unavailable repository', () => {
    expect(resolve(member(), { repo: repository({ available: false }) })).toEqual({
      ok: false,
      reason: 'workspace.branch-workspace.member-unavailable',
    })
  })

  test('rejects a member whose observed worktree is not ready', () => {
    expect(
      resolve(member({ ready: false }), { repo: repository({ path: '/workspace/other/api' }) }),
    ).toEqual({ ok: false, reason: 'workspace.branch-workspace.member-not-ready' })
  })

  test('distinguishes a missing target branch from a mismatched worktree path', () => {
    expect(resolve(member(), { repo: repository({ branch: 'main', path: '/workspace/other/api' }) })).toEqual({
      ok: false,
      reason: 'workspace.branch-workspace.member-branch-missing',
    })
    expect(resolve(member(), { repo: repository({ path: '/workspace/other/api' }) })).toEqual({
      ok: false,
      reason: 'workspace.branch-workspace.member-worktree-mismatch',
    })
  })

  test('uses the branch registered at the member path as a repairable drift target', () => {
    expect(
      resolve(member({ ready: false }), {
        repo: repository({ branch: 'release/previous' }),
      }),
    ).toEqual({
      ok: true,
      warning: 'workspace.branch-workspace.member-branch-drift',
      target: {
        repositoryId,
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        checkedOutBranch: 'release/previous',
        worktreePath,
      },
    })
  })
})
