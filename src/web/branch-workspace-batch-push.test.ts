import { describe, expect, test } from 'vitest'
import {
  branchWorkspacePushTargets,
  defaultBranchWorkspacePushRemote,
  initialBranchWorkspacePushRemotes,
} from '#/web/branch-workspace-batch-push.ts'
import type { BranchWorkspaceSyncPlan } from '#/shared/branch-workspace-git-actions.ts'

function pushPlan(): BranchWorkspaceSyncPlan {
  return {
    kind: 'push',
    token: 'sha256:push',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    ready: true,
    members: [
      {
        repositoryName: 'api',
        repoId: '/workspace/api',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/ws-1/api',
        targetHead: 'api-head',
        upstream: 'upstream/feature/a',
        trackingGone: false,
        requiresUpstreamCreation: false,
        pushRemotes: ['origin', 'upstream'],
        ready: true,
        fingerprint: 'sha256:api',
      },
      {
        repositoryName: 'web',
        repoId: '/workspace/web',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/ws-1/web',
        targetHead: 'web-head',
        upstream: null,
        trackingGone: false,
        requiresUpstreamCreation: true,
        pushRemotes: ['fork', 'origin'],
        ready: true,
        fingerprint: 'sha256:web',
      },
      {
        repositoryName: 'docs',
        repoId: '/workspace/docs',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/ws-1/docs',
        targetHead: 'docs-head',
        upstream: null,
        trackingGone: false,
        requiresUpstreamCreation: true,
        pushRemotes: ['fork'],
        ready: true,
        fingerprint: 'sha256:docs',
      },
    ],
  }
}

describe('branch workspace batch push selection', () => {
  test('defaults upstream creation to origin, then to a sole remote', () => {
    const plan = pushPlan()

    expect(defaultBranchWorkspacePushRemote(plan.members[1]!)).toBe('origin')
    expect(defaultBranchWorkspacePushRemote(plan.members[2]!)).toBe('fork')
    expect(initialBranchWorkspacePushRemotes(plan)).toEqual({ web: 'origin', docs: 'fork' })
  })

  test('does not guess between multiple non-origin remotes', () => {
    const member = pushPlan().members[1]!
    member.pushRemotes = ['backup', 'fork']

    expect(defaultBranchWorkspacePushRemote(member)).toBeNull()
    expect(initialBranchWorkspacePushRemotes(pushPlan())).toEqual({ web: 'origin', docs: 'fork' })
  })

  test('builds ordinary and create-upstream targets in manifest order', () => {
    const plan = pushPlan()

    expect(branchWorkspacePushTargets(plan, ['docs', 'api', 'web'], { web: 'fork', docs: 'fork' })).toEqual([
      { repositoryName: 'api', action: 'push' },
      { repositoryName: 'web', action: 'create-upstream', remote: 'fork' },
      { repositoryName: 'docs', action: 'create-upstream', remote: 'fork' },
    ])
  })

  test('requires a valid remote only for selected members that need upstream creation', () => {
    const plan = pushPlan()
    plan.members[1]!.pushRemotes = ['backup', 'fork']

    expect(branchWorkspacePushTargets(plan, ['api', 'web'], {})).toBeNull()
    expect(branchWorkspacePushTargets(plan, ['api', 'web'], { web: 'missing' })).toBeNull()
    expect(branchWorkspacePushTargets(plan, ['api'], {})).toEqual([{ repositoryName: 'api', action: 'push' }])
  })
})
