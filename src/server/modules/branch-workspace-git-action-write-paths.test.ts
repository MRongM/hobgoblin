import { describe, expect, test, vi } from 'vitest'
import { createBranchWorkspaceGitActionWriteService } from '#/server/modules/branch-workspace-git-action-write-paths.ts'
import type { BranchWorkspaceGitActionPlan } from '#/shared/branch-workspace-git-actions.ts'
import type { WorktreeBootstrapDecision } from '#/shared/worktree-bootstrap-summary.ts'
import type { CreateWorktreeInput } from '#/shared/worktree-create.ts'

const ROOT = '/workspace'

function batchPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-commit',
    token: 'sha256:batch',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      dirty: true,
      changeCount: 1,
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function discardPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-discard',
    token: 'sha256:discard',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => {
      const paths = repositoryName === 'web' ? [] : [`src/${repositoryName}.ts`, `scratch/${repositoryName}.txt`]
      return {
        repositoryName,
        repoId: `${ROOT}/${repositoryName}`,
        targetBranch: 'feature/a',
        targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
        paths,
        changeCount: paths.length,
        fingerprint: `sha256:${repositoryName}`,
      }
    }),
  }
}

function mergeOutPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-merge-out',
    token: 'sha256:merge',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: 'target-head',
      ready: true,
      destinationBranches: [
        {
          destination: { kind: 'local', branch: 'main' },
          head: 'main-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          destination: { kind: 'local', branch: 'release/v2' },
          head: 'release-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}-release`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: true,
        },
        {
          destination: { kind: 'local', branch: 'integration' },
          head: 'integration-head',
          ready: true,
          worktreePath: `${ROOT}/${repositoryName}-integration`,
          requiresTemporaryWorktree: false,
          pullMergePushReady: false,
        },
        {
          destination: { kind: 'local', branch: 'staging' },
          head: 'staging-head',
          ready: true,
          requiresTemporaryWorktree: true,
          pullMergePushReady: true,
        },
      ],
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function mergeOutTargets(
  entries: Array<[string, string]> = [
    ['api', 'main'],
    ['web', 'main'],
  ],
) {
  return entries.map(([repositoryName, branch]) => ({
    repositoryName,
    destination: { kind: 'local' as const, branch },
  }))
}

function mergeInPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-merge-in',
    token: 'sha256:merge-in',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    members: repositoryNames.map((repositoryName) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: 'target-head',
      ready: true,
      pullMergePushReady: true,
      sourceBranches: [
        { source: { kind: 'local', branch: 'main' }, head: 'main-head' },
        { source: { kind: 'local', branch: 'release/v2' }, head: 'release-head' },
      ],
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function mergeInSources(
  entries: Array<[string, string]> = [
    ['api', 'main'],
    ['web', 'main'],
  ],
) {
  return entries.map(([repositoryName, branch]) => ({
    repositoryName,
    source: { kind: 'local' as const, branch },
  }))
}

function remoteMergeInPlan(): BranchWorkspaceGitActionPlan {
  const plan = mergeInPlan(['api'])
  if (plan.kind !== 'batch-merge-in') throw new Error('expected merge-in plan')
  plan.members[0]!.sourceBranches.push({
    source: { kind: 'remote', remoteRef: 'origin/release/v2' },
    head: 'remote-release-head',
  })
  return plan
}

function remoteMergeOutPlan(): BranchWorkspaceGitActionPlan {
  const plan = mergeOutPlan(['api'])
  if (plan.kind !== 'batch-merge-out') throw new Error('expected merge-out plan')
  plan.members[0]!.destinationBranches.push({
    destination: { kind: 'remote', remoteRef: 'origin/release/v2' },
    head: 'remote-release-head',
    ready: true,
    requiresTemporaryWorktree: true,
    pullMergePushReady: true,
  })
  return plan
}

function syncPlan(kind: 'pull' | 'push', ready = true, repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind,
    token: `sha256:${kind}`,
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    ready,
    members: repositoryNames.map((repositoryName, index) => ({
      repositoryName,
      repoId: `${ROOT}/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
      targetHead: `target-head-${index}`,
      ready,
      ...(!ready
        ? {
            message:
              kind === 'pull'
                ? 'workspace.branch-workspace.git-action.target-upstream-required'
                : 'workspace.branch-workspace.git-action.remote-required',
          }
        : {}),
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function batchSetUpstreamPlan(repositoryNames = ['api', 'web']): BranchWorkspaceGitActionPlan {
  return {
    kind: 'batch-set-upstream',
    token: 'sha256:set-upstream',
    rootId: ROOT,
    branchWorkspaceId: 'ws-1',
    ready: true,
    members: repositoryNames.map((repositoryName) => {
      const isApi = repositoryName === 'api'
      const isWeb = repositoryName === 'web'
      return {
        repositoryName,
        repoId: `${ROOT}/${repositoryName}`,
        targetBranch: 'feature/a',
        targetWorktreePath: `${ROOT}/goblin-feature-a/${repositoryName}`,
        targetHead: `target-head-${repositoryName}`,
        currentUpstream: null,
        trackingGone: false,
        remoteBranches: isApi
          ? [
              { remoteRef: 'origin/release', head: 'origin-release-head' },
              { remoteRef: 'origin/other', head: 'origin-other-head' },
            ]
          : [
              {
                remoteRef: isWeb ? 'upstream/release' : `origin/${repositoryName}-release`,
                head: `${repositoryName}-release-head`,
              },
            ],
        ready: true,
        fingerprint: `sha256:${repositoryName}`,
      }
    }),
  }
}

describe('createBranchWorkspaceGitActionWriteService', () => {
  test('sets selected member upstreams in manifest order and invalidates only touched repositories', async () => {
    const plan = batchSetUpstreamPlan()
    const setUpstream = vi.fn(
      async (
        _repoId: string,
        _branch: string,
        _remoteRef: string | null,
        _signal?: AbortSignal,
        _sourceToken?: string,
        _options?: { publishInvalidation?: boolean },
      ) => ({ ok: true as const, message: '' }),
    )
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/release' },
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })

    expect(setUpstream.mock.calls.map(([repoId, branch, remoteRef]) => [repoId, branch, remoteRef])).toEqual([
      ['/workspace/api', 'feature/a', 'origin/release'],
      ['/workspace/web', 'feature/a', 'upstream/release'],
    ])
    expect(
      setUpstream.mock.calls.every((call) => {
        const options = call[5]
        return (
          typeof options === 'object' &&
          options !== null &&
          'publishInvalidation' in options &&
          options.publishInvalidation === false
        )
      }),
    ).toBe(true)
    expect(publishRepoInvalidation.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api', '/workspace/web'])
  })

  test('removes a selected member upstream by passing a null remote ref', async () => {
    const plan = batchSetUpstreamPlan()
    const setUpstream = vi.fn(async () => ({ ok: true as const, message: '' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [{ repositoryName: 'api', action: 'unset' }],
      }),
    ).resolves.toMatchObject({
      ok: true,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'satisfied' },
      ],
    })
    expect(setUpstream).toHaveBeenCalledWith('/workspace/api', 'feature/a', null, expect.any(AbortSignal), undefined, {
      publishInvalidation: false,
    })
  })

  test('marks unselected upstream members satisfied after a partial success and invalidates only attempted members', async () => {
    const plan = batchSetUpstreamPlan(['api', 'web', 'docs'])
    const setUpstream = vi.fn(async () => ({ ok: true as const, message: '' }))
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [{ repositoryName: 'api', action: 'set', remoteRef: 'origin/release' }],
      }),
    ).resolves.toMatchObject({
      ok: true,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'satisfied' },
        { repositoryName: 'docs', phase: 'satisfied' },
      ],
    })
    expect(publishRepoInvalidation.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api'])
  })

  test('stops on an upstream failure and locks retries to the same remaining mappings', async () => {
    const plan = batchSetUpstreamPlan(['api', 'web', 'docs'])
    const setUpstream = vi
      .fn(
        async (
          _repoId: string,
          _branch: string,
          _remoteRef: string | null,
          _signal?: AbortSignal,
          _sourceToken?: string,
          _options?: { publishInvalidation?: boolean },
        ): Promise<{ ok: boolean; message: string }> => ({ ok: true, message: '' }),
      )
      .mockResolvedValueOnce({ ok: true as const, message: '' })
      .mockResolvedValueOnce({ ok: false as const, message: 'failed' })
      .mockResolvedValueOnce({ ok: true as const, message: '' })
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })
    const upstreams = [
      { repositoryName: 'web', action: 'set' as const, remoteRef: 'upstream/release' },
      { repositoryName: 'api', action: 'set' as const, remoteRef: 'origin/release' },
    ]

    await expect(
      service.execute(ROOT, { kind: 'batch-set-upstream', planToken: plan.token, upstreams }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'failed', step: 'upstream' },
        { repositoryName: 'docs', phase: 'satisfied' },
      ],
    })
    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/other' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/release' },
        ],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      service.execute(ROOT, { kind: 'batch-set-upstream', planToken: plan.token, upstreams }),
    ).resolves.toMatchObject({ ok: true })

    expect(setUpstream.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
    expect(publishRepoInvalidation.mock.calls.map(([repoId]) => repoId)).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/web',
    ])
  })

  test('rejects upstream mappings unavailable from the refreshed plan', async () => {
    const plan = batchSetUpstreamPlan()
    const refreshed = batchSetUpstreamPlan()
    if (refreshed.kind !== 'batch-set-upstream') throw new Error('expected batch upstream plan')
    refreshed.members[1] = { ...refreshed.members[1]!, ready: false, remoteBranches: [], message: 'unavailable' }
    const setUpstream = vi.fn(
      async (
        _repoId: string,
        _branch: string,
        _remoteRef: string | null,
        _signal?: AbortSignal,
        _sourceToken?: string,
        _options?: { publishInvalidation?: boolean },
      ) => ({ ok: true as const, message: '' }),
    )
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan: refreshed })),
      setUpstream,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/release' },
        ],
      }),
    ).resolves.toEqual({ ok: false, message: 'unavailable' })
    expect(setUpstream).not.toHaveBeenCalled()
  })

  test('stops after the first upstream failure, keeps selected pending members not-started, and reports upstream activity', async () => {
    const plan = batchSetUpstreamPlan(['api', 'web', 'docs'])
    const steps: string[] = []
    const setUpstream = vi.fn(async () => ({ ok: false as const, message: 'failed' }))
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
      publishOperationUpdate: vi.fn((_rootId, _branchWorkspaceId, operation) => {
        if (operation?.step) steps.push(operation.step)
      }),
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/release' },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'upstream' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'satisfied' },
      ],
    })
    expect(steps).toContain('upstream')
    expect(setUpstream).toHaveBeenCalledTimes(1)
    expect(publishRepoInvalidation.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api'])
  })

  test('stops upstream execution before the next member after cancellation', async () => {
    const plan = batchSetUpstreamPlan(['api', 'web', 'docs'])
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    const setUpstream = vi.fn(async () => {
      service.abort(ROOT)
      return { ok: false as const, message: 'cancelled' }
    })
    const publishRepoInvalidation = vi.fn()
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      setUpstream,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-set-upstream', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-set-upstream',
        planToken: plan.token,
        upstreams: [
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/release' },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: 'cancelled',
      members: [
        { repositoryName: 'api', phase: 'not-started' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'satisfied' },
      ],
    })
    expect(setUpstream).toHaveBeenCalledTimes(1)
    expect(publishRepoInvalidation.mock.calls.map(([repoId]) => repoId)).toEqual(['/workspace/api'])
  })

  test('publishes lightweight operation progress only after execution-time validation', async () => {
    const plan = batchPlan()
    const events: string[] = []
    let releaseValidation = () => {}
    const validationGate = new Promise<void>((resolve) => {
      releaseValidation = resolve
    })
    const publishOperationUpdate = vi.fn((_rootId, _branchWorkspaceId, operation) => {
      events.push(operation ? `operation:${operation.step ?? 'start'}` : 'operation:clear')
    })
    const publishRepoInvalidation = vi.fn((repoId) => events.push(`repo:${repoId}`))
    const commit = vi.fn(async () => {
      events.push('commit')
      return { ok: true as const, message: 'committed' }
    })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => {
        events.push('validate:start')
        await validationGate
        events.push('validate:end')
        return { ok: true as const, plan }
      }),
      commit,
      publishOperationUpdate,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })

    const execution = service.execute(ROOT, {
      kind: 'batch-commit',
      planToken: plan.token,
      messages: [
        { repositoryName: 'api', message: 'feat: api' },
        { repositoryName: 'web', message: 'feat: web' },
      ],
    })
    await Promise.resolve()
    const publishedBeforeValidationFinished = publishOperationUpdate.mock.calls.length > 0
    releaseValidation()
    await execution

    expect(publishedBeforeValidationFinished).toBe(false)
    expect(events.indexOf('operation:start')).toBeGreaterThan(events.indexOf('validate:end'))
    expect(events.indexOf('operation:start')).toBeLessThan(events.indexOf('commit'))
    expect(events.at(-4)).toBe('operation:commit')
    expect(events.at(-3)).toBe('operation:clear')
    expect(events.at(-2)).toBe('repo:/workspace/api')
    expect(events.at(-1)).toBe('repo:/workspace/web')
    expect(commit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(publishRepoInvalidation.mock.calls.map((call) => call[0])).toEqual(['/workspace/api', '/workspace/web'])
  })

  test('defers one repository invalidation until pull refresh and the remaining pipeline finish', async () => {
    const plan = mergeInPlan(['api'])
    const events: string[] = []
    const publishRepoInvalidation = vi.fn((repoId) => events.push(`repo:${repoId}`))
    const buildPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, plan })
      .mockImplementationOnce(async () => {
        events.push('refresh')
        expect(publishRepoInvalidation).not.toHaveBeenCalled()
        return { ok: true as const, plan }
      })
    const pull = vi.fn(async () => {
      events.push('pull')
      return { ok: true as const, message: 'pulled' }
    })
    const merge = vi.fn(async () => {
      events.push('merge')
      return { ok: true as const, message: 'merged' }
    })
    const push = vi.fn(async () => {
      events.push('push')
      return { ok: true as const, message: 'pushed' }
    })
    const publishOperationUpdate = vi.fn((_rootId, _branchWorkspaceId, operation) => {
      events.push(operation ? `operation:${operation.step ?? 'start'}` : 'operation:clear')
    })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan,
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
      publishOperationUpdate,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', source: { kind: 'local', branch: 'main' } }],
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(events).toEqual([
      'operation:start',
      'operation:pull',
      'pull',
      'refresh',
      'operation:merge',
      'merge',
      'operation:push',
      'push',
      'operation:push',
      'operation:clear',
      'repo:/workspace/api',
    ])
    expect(pull.mock.calls[0]?.at(-1)).toEqual({ publishInvalidation: false })
    expect(merge.mock.calls[0]?.at(-1)).toEqual({ publishInvalidation: false })
    expect(push.mock.calls[0]?.at(-1)).toEqual({ publishInvalidation: false })
  })

  test('does not publish operation or repository updates when execution-time validation fails', async () => {
    const plan = batchPlan()
    const publishOperationUpdate = vi.fn()
    const publishRepoInvalidation = vi.fn()
    const commit = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({
        ok: false as const,
        message: 'workspace.branch-workspace.git-action.repository-unavailable',
      })),
      commit,
      publishOperationUpdate,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-commit',
        planToken: plan.token,
        messages: [
          { repositoryName: 'api', message: 'feat: api' },
          { repositoryName: 'web', message: 'feat: web' },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.repository-unavailable',
    })
    expect(commit).not.toHaveBeenCalled()
    expect(publishOperationUpdate).not.toHaveBeenCalled()
    expect(publishRepoInvalidation).not.toHaveBeenCalled()
  })

  test('commits serially, aggregates member failures, and retries failed members only', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'api failed' })
      .mockResolvedValueOnce({ ok: true, message: 'committed web' })
      .mockResolvedValueOnce({ ok: false, message: 'docs failed' })
      .mockResolvedValueOnce({ ok: true, message: 'committed api' })
      .mockResolvedValueOnce({ ok: true, message: 'committed docs' })
    const plan = batchPlan(['api', 'web', 'docs'])
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      commit,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })
    const input = {
      kind: 'batch-commit' as const,
      planToken: plan.token,
      messages: [
        { repositoryName: 'api', message: 'feat: api' },
        { repositoryName: 'web', message: 'feat: web' },
        { repositoryName: 'docs', message: 'docs: update' },
      ],
    }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({
      ok: false,
      message: 'workspace.branch-workspace.git-action.members-failed',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'commit',
          message: 'api failed',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        { repositoryName: 'web', phase: 'succeeded' },
        {
          repositoryName: 'docs',
          phase: 'failed',
          step: 'commit',
          message: 'docs failed',
          worktreePath: '/workspace/goblin-feature-a/docs',
        },
      ],
    })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(commit.mock.calls.map((call) => call[0])).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/docs',
      '/workspace/api',
      '/workspace/docs',
    ])
    expect(publishRepoInvalidation.mock.calls.map((call) => call[0])).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/docs',
      '/workspace/api',
      '/workspace/docs',
    ])
  })

  test('isolates a thrown repository error to the current batch member', async () => {
    const plan = batchPlan()
    const commit = vi
      .fn()
      .mockRejectedValueOnce(new Error('api backend unavailable'))
      .mockResolvedValueOnce({ ok: true as const, message: 'committed web' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      commit,
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-commit',
        planToken: plan.token,
        messages: [
          { repositoryName: 'api', message: 'feat: api' },
          { repositoryName: 'web', message: 'feat: web' },
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'commit', message: 'api backend unavailable' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(commit).toHaveBeenCalledTimes(2)
  })

  test('discards exact dirty-member paths serially while isolating failures and skipping clean members', async () => {
    const plan = discardPlan(['api', 'web', 'docs'])
    const discard = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'api discard failed' })
      .mockResolvedValueOnce({ ok: true, message: 'discarded docs' })
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      discard,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-discard', branchWorkspaceId: 'ws-1' })

    await expect(service.execute(ROOT, { kind: 'batch-discard', planToken: plan.token })).resolves.toMatchObject({
      ok: false,
      message: 'workspace.branch-workspace.git-action.members-failed',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'discard',
          message: 'api discard failed',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        { repositoryName: 'web', phase: 'satisfied' },
        { repositoryName: 'docs', phase: 'succeeded' },
      ],
    })
    expect(discard.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', '/workspace/goblin-feature-a/api', ['src/api.ts', 'scratch/api.txt']],
      ['/workspace/docs', '/workspace/goblin-feature-a/docs', ['src/docs.ts', 'scratch/docs.txt']],
    ])
    expect(discard.mock.calls.every((call) => call.at(-1)?.publishInvalidation === false)).toBe(true)
    expect(publishRepoInvalidation.mock.calls.map((call) => call[0])).toEqual(['/workspace/api', '/workspace/docs'])
  })

  test('stops batch discard before the next member after cancellation', async () => {
    const plan = discardPlan(['api', 'docs'])
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    const discard = vi.fn(async () => {
      service.abort(ROOT)
      return { ok: false as const, message: 'cancelled' }
    })
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      discard,
    })
    await service.plan(ROOT, { kind: 'batch-discard', branchWorkspaceId: 'ws-1' })

    await expect(service.execute(ROOT, { kind: 'batch-discard', planToken: plan.token })).resolves.toMatchObject({
      ok: false,
      message: 'cancelled',
    })
    expect(discard).toHaveBeenCalledTimes(1)
  })

  test('merges selected sources into member targets in manifest order without temporary worktrees', async () => {
    const plan = mergeInPlan(['api', 'web', 'docs'])
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      createWorktree,
      removeWorktree,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'merge',
        sources: mergeInSources([
          ['web', 'release/v2'],
          ['api', 'main'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(merge.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', '/workspace/goblin-feature-a/api', 'main'],
      ['/workspace/web', '/workspace/goblin-feature-a/web', 'release/v2'],
    ])
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('runs pull and push against merge-in target branches rather than selected sources', async () => {
    const plan = mergeInPlan()
    const calls: string[] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async (_repoId, branch, worktreePath) => {
        calls.push(`pull:${branch}:${worktreePath}`)
        return { ok: true, message: 'pulled' }
      }),
      merge: vi.fn(async (_repoId, worktreePath, branch) => {
        calls.push(`merge:${branch}:${worktreePath}`)
        return { ok: true, message: 'merged' }
      }),
      push: vi.fn(async (_repoId, branch) => {
        calls.push(`push:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', source: { kind: 'local', branch: 'release/v2' } }],
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([
      'pull:feature/a:/workspace/goblin-feature-a/api',
      'merge:release/v2:/workspace/goblin-feature-a/api',
      'push:feature/a',
    ])
  })

  test('aggregates merge-in failures, continues later members, and retains conflict sites', async () => {
    const plan = mergeInPlan(['api', 'web', 'docs'])
    const merge = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'api conflict', reason: 'merge-conflict' as const })
      .mockResolvedValueOnce({ ok: false as const, message: 'web merge failed' })
      .mockResolvedValueOnce({ ok: true as const, message: 'docs merged' })
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const publishOperationUpdate = vi.fn()
    const publishRepoInvalidation = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
      createWorktree,
      removeWorktree,
      publishOperationUpdate,
      publishRepoInvalidation,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'merge',
        sources: mergeInSources([
          ['api', 'main'],
          ['web', 'main'],
          ['docs', 'main'],
        ]),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          message: 'api conflict',
          reason: 'merge-conflict',
          worktreePath: '/workspace/goblin-feature-a/api',
          conflictWorktree: {
            branch: 'feature/a',
            path: '/workspace/goblin-feature-a/api',
          },
        },
        {
          repositoryName: 'web',
          phase: 'failed',
          step: 'merge',
          message: 'web merge failed',
          worktreePath: '/workspace/goblin-feature-a/web',
        },
        { repositoryName: 'docs', phase: 'succeeded' },
      ],
    })
    expect(merge).toHaveBeenCalledTimes(3)
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
    expect(publishOperationUpdate).toHaveBeenLastCalledWith(ROOT, 'ws-1', null)
    expect(publishRepoInvalidation.mock.calls.map((call) => call[0])).toEqual([
      '/workspace/api',
      '/workspace/web',
      '/workspace/docs',
    ])
  })

  test('rejects invalid merge-in sources and missing target upstream before Git writes', async () => {
    const plan = mergeInPlan()
    if (plan.kind !== 'batch-merge-in') throw new Error('expected merge-in plan')
    plan.members[1]!.ready = false
    plan.members[1]!.message = 'workspace.branch-workspace.git-action.target-worktree-dirty'
    const pull = vi.fn()
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    for (const sources of [
      [{ repositoryName: 'missing', source: { kind: 'local' as const, branch: 'main' } }],
      [{ repositoryName: 'api', source: { kind: 'local' as const, branch: 'feature/a' } }],
      [{ repositoryName: 'web', source: { kind: 'local' as const, branch: 'main' } }],
    ]) {
      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-in',
          planToken: plan.token,
          mode: 'merge',
          sources,
        }),
      ).resolves.toMatchObject({ ok: false })
    }

    plan.members[0]!.pullMergePushReady = false
    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', source: { kind: 'local', branch: 'main' } }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.target-upstream-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('binds merge-in retry to mode and source mapping while resuming completed remote steps', async () => {
    const plan = mergeInPlan()
    const pull = vi.fn(async () => ({ ok: true, message: 'pulled' }))
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const push = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'push failed' })
      .mockResolvedValueOnce({ ok: true, message: 'pushed' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })
    const input = {
      kind: 'batch-merge-in' as const,
      planToken: plan.token,
      mode: 'pull-merge-push' as const,
      sources: [{ repositoryName: 'api', source: { kind: 'local' as const, branch: 'main' } }],
    }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: false })
    await expect(
      service.execute(ROOT, {
        ...input,
        sources: [{ repositoryName: 'api', source: { kind: 'local', branch: 'release/v2' } }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(pull).toHaveBeenCalledTimes(1)
    expect(merge).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('stops merge-in after target pull when the selected source head changes', async () => {
    const plan = mergeInPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind !== 'batch-merge-in') throw new Error('expected merge-in plan')
    changedPlan.members[0]!.sourceBranches[0]!.head = 'changed-main-head'
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn()
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode: 'pull-merge-push',
        sources: [{ repositoryName: 'api', source: { kind: 'local', branch: 'main' } }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge' },
        { repositoryName: 'web', phase: 'not-started' },
      ],
    })
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('runs each repository pipeline against its explicitly selected destination branch', async () => {
    const calls: string[] = []
    const plan = mergeOutPlan()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async (_repoId, branch, worktreePath) => {
        calls.push(`pull:${branch}:${worktreePath}`)
        return { ok: true, message: 'pulled' }
      }),
      merge: vi.fn(async (_repoId, worktreePath, branch) => {
        calls.push(`merge:${branch}:${worktreePath}`)
        return { ok: true, message: 'merged' }
      }),
      push: vi.fn(async (_repoId, branch) => {
        calls.push(`push:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets([
          ['web', 'main'],
          ['api', 'release/v2'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual([
      'pull:release/v2:/workspace/api-release',
      'merge:feature/a:/workspace/api-release',
      'push:release/v2',
      'pull:main:/workspace/web',
      'merge:feature/a:/workspace/web',
      'push:main',
    ])
  })

  test('merges only selected repositories in plan order and reports selected progress', async () => {
    const plan = mergeOutPlan(['api', 'web', 'docs'])
    const calls: string[] = []
    const operations: Array<
      ReturnType<ReturnType<typeof createBranchWorkspaceGitActionWriteService>['activeOperation']>
    > = []
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge: vi.fn(async (repoId) => {
        calls.push(repoId)
        operations.push(service.activeOperation(ROOT, 'ws-1'))
        return { ok: true, message: 'merged' }
      }),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['web', 'main'],
          ['api', 'main'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual(['/workspace/api', '/workspace/web'])
    expect(operations).toEqual([
      {
        kind: 'batch-merge-out',
        currentStep: 1,
        completedCount: 0,
        totalCount: 2,
        cancellable: true,
        repositoryName: 'api',
        step: 'merge',
      },
      {
        kind: 'batch-merge-out',
        currentStep: 2,
        completedCount: 1,
        totalCount: 2,
        cancellable: true,
        repositoryName: 'web',
        step: 'merge',
      },
    ])
  })

  test('validates readiness and fingerprints only for selected merge members and destinations', async () => {
    const plan = mergeOutPlan(['api', 'web', 'docs'])
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    plan.members[2]!.destinationBranches[0]!.pullMergePushReady = false
    const ignoredSets: string[][] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async (_plan, ignored) => {
        ignoredSets.push([...ignored].sort())
        return { ok: true as const, plan }
      }),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge: vi.fn(async () => ({ ok: true, message: 'merged' })),
      push: vi.fn(async () => ({ ok: true, message: 'pushed' })),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(ignoredSets).toEqual([['docs']])
  })

  test('rejects unknown, source-identical, and unavailable destinations before Git writes', async () => {
    const plan = mergeOutPlan()
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    plan.members[1]!.destinationBranches[0]!.ready = false
    plan.members[1]!.destinationBranches[0]!.message =
      'workspace.branch-workspace.git-action.destination-worktree-dirty'
    const merge = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    for (const targets of [
      [{ repositoryName: 'missing', destination: { kind: 'local' as const, branch: 'main' } }],
      [{ repositoryName: 'api', destination: { kind: 'local' as const, branch: 'feature/a' } }],
      [{ repositoryName: 'web', destination: { kind: 'local' as const, branch: 'main' } }],
    ]) {
      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-out',
          planToken: plan.token,
          mode: 'merge',
          targets,
        }),
      ).resolves.toMatchObject({ ok: false })
    }
    expect(merge).not.toHaveBeenCalled()
  })

  test('binds failed merge retries to the original selected members and destinations', async () => {
    const plan = mergeOutPlan()
    const merge = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: 'api merged' })
      .mockResolvedValueOnce({ ok: false, message: 'web failed' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })
    const original = {
      kind: 'batch-merge-out' as const,
      planToken: plan.token,
      mode: 'merge' as const,
      targets: mergeOutTargets(),
    }
    await expect(service.execute(ROOT, original)).resolves.toMatchObject({ ok: false })

    await expect(
      service.execute(ROOT, {
        ...original,
        targets: mergeOutTargets([
          ['api', 'release/v2'],
          ['web', 'main'],
        ]),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(merge).toHaveBeenCalledTimes(2)
  })

  test('binds failed merge retries to the original pipeline mode', async () => {
    const plan = mergeOutPlan()
    const merge = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'merge failed' })
      .mockResolvedValueOnce({ ok: true, message: 'web merged' })
    const pull = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })
    const original = {
      kind: 'batch-merge-out' as const,
      planToken: plan.token,
      mode: 'merge' as const,
      targets: mergeOutTargets(),
    }
    await expect(service.execute(ROOT, original)).resolves.toMatchObject({ ok: false })

    await expect(service.execute(ROOT, { ...original, mode: 'pull-merge-push' })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(merge).toHaveBeenCalledTimes(2)
  })

  test('checks pull-merge-push readiness on the selected destination only', async () => {
    const plan = mergeOutPlan()
    const pull = vi.fn()
    const merge = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: [{ repositoryName: 'api', destination: { kind: 'local', branch: 'integration' } }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.destination-upstream-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('retains an existing merge-out conflict site and continues later members', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const merge = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        message: 'conflict',
        reason: 'merge-conflict' as const,
      })
      .mockResolvedValueOnce({ ok: true as const, message: 'web merged' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          reason: 'merge-conflict',
          worktreePath: '/workspace/api',
          conflictWorktree: { branch: 'main', path: '/workspace/api' },
        },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(merge).toHaveBeenCalledTimes(2)
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test('continues merge-out after a temporary destination cannot be prepared', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'api prepare failed' })
      .mockResolvedValueOnce({ ok: true as const, message: 'web prepared' })
    const removeWorktree = vi.fn(async () => ({ ok: true as const, message: 'removed' }))
    const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['api', 'staging'],
          ['web', 'staging'],
        ]),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'prepare', message: 'api prepare failed' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(createWorktree).toHaveBeenCalledTimes(2)
    expect(merge).toHaveBeenCalledTimes(1)
    expect(removeWorktree).toHaveBeenCalledTimes(1)
  })

  test('cleans a failed temporary merge-out member before continuing the next member', async () => {
    const plan = mergeOutPlan()
    const events: string[] = []
    const createWorktree = vi.fn(async (repoId: string) => {
      events.push(`prepare:${repoId}`)
      return { ok: true as const, message: 'prepared' }
    })
    const merge = vi
      .fn()
      .mockImplementationOnce(async (repoId: string) => {
        events.push(`merge:${repoId}`)
        return { ok: false as const, message: 'api merge failed' }
      })
      .mockImplementationOnce(async (repoId: string) => {
        events.push(`merge:${repoId}`)
        return { ok: true as const, message: 'web merged' }
      })
    const removeWorktree = vi.fn(async (repoId: string) => {
      events.push(`cleanup:${repoId}`)
      return { ok: true as const, message: 'removed' }
    })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['api', 'staging'],
          ['web', 'staging'],
        ]),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'api merge failed' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(events).toEqual([
      'prepare:/workspace/api',
      'merge:/workspace/api',
      'cleanup:/workspace/api',
      'prepare:/workspace/web',
      'merge:/workspace/web',
      'cleanup:/workspace/web',
    ])
  })

  test('records temporary cleanup failure and still attempts the next merge-out member', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn(async () => ({ ok: true as const, message: 'prepared' }))
    const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
    const removeWorktree = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'api cleanup failed' })
      .mockResolvedValueOnce({ ok: true as const, message: 'web removed' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['api', 'staging'],
          ['web', 'staging'],
        ]),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'cleanup', message: 'api cleanup failed' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(createWorktree).toHaveBeenCalledTimes(2)
    expect(merge).toHaveBeenCalledTimes(2)
    expect(removeWorktree).toHaveBeenCalledTimes(2)
  })

  test('cleans the current temporary destination and stops later members when cancelled', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn(async () => ({ ok: true as const, message: 'prepared' }))
    const removeWorktree = vi.fn(async () => ({ ok: true as const, message: 'removed' }))
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    const merge = vi.fn(async () => {
      service.abort(ROOT)
      return { ok: false as const, message: 'cancelled' }
    })
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: mergeOutTargets([
          ['api', 'staging'],
          ['web', 'staging'],
        ]),
      }),
    ).resolves.toMatchObject({ ok: false, message: 'cancelled' })
    expect(createWorktree).toHaveBeenCalledTimes(1)
    expect(merge).toHaveBeenCalledTimes(1)
    expect(removeWorktree).toHaveBeenCalledTimes(1)
  })

  test('creates and removes an application temporary worktree for an unchecked-out destination', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn(
      async (
        _repoId: string,
        _input: CreateWorktreeInput,
        _bootstrap: WorktreeBootstrapDecision,
        _signal?: AbortSignal,
        _sourceToken?: string,
      ) => ({ ok: true, message: 'created' }),
    )
    const removeWorktree = vi.fn(async () => ({ ok: true, message: 'removed' }))
    const merge = vi.fn(async () => ({ ok: true, message: 'merged' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destination: { kind: 'local', branch: 'staging' } }],
      }),
    ).resolves.toMatchObject({ ok: true })

    const temporaryPath = createWorktree.mock.calls[0]?.[1].worktreePath
    expect(temporaryPath).toContain('/workspace/.hobgoblin-batch-merge-api-')
    expect(createWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      {
        worktreePath: temporaryPath,
        mode: { kind: 'existingBranch', branch: 'staging' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(merge).toHaveBeenCalledWith(
      '/workspace/api',
      temporaryPath,
      'feature/a',
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(removeWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      {
        branch: 'staging',
        worktreePath: temporaryPath,
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
      },
      undefined,
      undefined,
      { publishInvalidation: false },
    )
  })

  test.each([
    ['merge conflict', { ok: false, message: 'conflict', reason: 'merge-conflict' as const }],
    ['cancellation', { ok: false, message: 'cancelled' }],
  ])('cleans an application temporary worktree after %s', async (_label, mergeResult) => {
    const plan = mergeOutPlan()
    const removeWorktree = vi.fn(async () => ({ ok: true, message: 'removed' }))
    const publishOperationUpdate = vi.fn()
    const publishRepoInvalidation = vi.fn()
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree: vi.fn(async () => ({ ok: true, message: 'created' })),
      removeWorktree,
      publishOperationUpdate,
      publishRepoInvalidation,
      merge: vi.fn(async () => {
        if (mergeResult.message === 'cancelled') service.abort(ROOT)
        return mergeResult
      }),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    const result = await service.execute(ROOT, {
      kind: 'batch-merge-out',
      planToken: plan.token,
      mode: 'merge',
      targets: [{ repositoryName: 'api', destination: { kind: 'local', branch: 'staging' } }],
    })
    expect(result).toMatchObject({ ok: false })
    if ('members' in result) {
      expect(result.members.find((member) => member.repositoryName === 'api')).not.toHaveProperty('conflictWorktree')
    }
    expect(removeWorktree).toHaveBeenCalledTimes(1)
    expect(publishOperationUpdate).toHaveBeenLastCalledWith(ROOT, 'ws-1', null)
    expect(publishRepoInvalidation.mock.calls.map((call) => call[0])).toEqual(['/workspace/api'])
  })

  test('never creates or removes an ordinary selected destination worktree', async () => {
    const plan = mergeOutPlan()
    const createWorktree = vi.fn()
    const removeWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      createWorktree,
      removeWorktree,
      merge: vi.fn(async () => ({ ok: true, message: 'merged' })),
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destination: { kind: 'local', branch: 'main' } }],
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(createWorktree).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
  })

  test.each([
    ['merge', ['fetch', 'refresh', 'merge']],
    ['pull-merge-push', ['pull', 'fetch', 'refresh', 'merge', 'push']],
  ] as const)('fetches and verifies a remote merge-in source in %s mode', async (mode, expectedEvents) => {
    const plan = remoteMergeInPlan()
    const events: string[] = []
    const buildPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, plan })
      .mockImplementationOnce(async () => {
        events.push('refresh')
        return { ok: true as const, plan }
      })
    const fetchRemote = vi.fn(async () => {
      events.push('fetch')
      return { ok: true as const, message: 'fetched' }
    })
    const merge = vi.fn(async () => {
      events.push('merge')
      return { ok: true as const, message: 'merged' }
    })
    const pull = vi.fn(async () => {
      events.push('pull')
      return { ok: true as const, message: 'pulled' }
    })
    const push = vi.fn(async () => {
      events.push('push')
      return { ok: true as const, message: 'pushed' }
    })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan,
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      fetchRemote,
      merge,
      pull,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-in', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-in',
        planToken: plan.token,
        mode,
        sources: [{ repositoryName: 'api', source: { kind: 'remote', remoteRef: 'origin/release/v2' } }],
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(events).toEqual(expectedEvents)
    expect(fetchRemote).toHaveBeenCalledWith('/workspace/api', 'origin', expect.any(AbortSignal), undefined, {
      publishInvalidation: false,
    })
    expect(merge).toHaveBeenCalledWith(
      '/workspace/api',
      '/workspace/goblin-feature-a/api',
      'refs/remotes/origin/release/v2',
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
  })

  test('runs a remote merge-out through exact fetch, detached worktree, exact HEAD push, and cleanup', async () => {
    const plan = remoteMergeOutPlan()
    const events: string[] = []
    const buildPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, plan })
      .mockImplementationOnce(async () => {
        events.push('refresh')
        return { ok: true as const, plan }
      })
    const fetchRemote = vi.fn(async () => {
      events.push('fetch')
      return { ok: true as const, message: 'fetched' }
    })
    const createWorktree = vi.fn(async (_repoId: string, _input: CreateWorktreeInput) => {
      events.push('prepare')
      return { ok: true as const, message: 'prepared' }
    })
    const merge = vi.fn(async () => {
      events.push('merge')
      return { ok: true as const, message: 'merged' }
    })
    const pushWorktreeHead = vi.fn(async () => {
      events.push('push')
      return { ok: true as const, message: 'pushed' }
    })
    const removeWorktree = vi.fn(async () => {
      events.push('cleanup')
      return { ok: true as const, message: 'removed' }
    })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan,
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      fetchRemote,
      createWorktree,
      merge,
      pushWorktreeHead,
      removeWorktree,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: [{ repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'origin/release/v2' } }],
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(events).toEqual(['fetch', 'refresh', 'prepare', 'merge', 'push', 'cleanup'])
    const worktreePath = createWorktree.mock.calls[0]?.[1].worktreePath
    expect(createWorktree).toHaveBeenCalledWith(
      '/workspace/api',
      {
        worktreePath,
        mode: { kind: 'detached', ref: 'refs/remotes/origin/release/v2' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(merge).toHaveBeenCalledWith(
      '/workspace/api',
      worktreePath,
      'refs/heads/feature/a',
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(pushWorktreeHead).toHaveBeenCalledWith(
      '/workspace/api',
      worktreePath,
      'origin/release/v2',
      expect.any(AbortSignal),
      undefined,
      { publishInvalidation: false },
    )
    expect(removeWorktree).toHaveBeenCalledTimes(1)
  })

  test('rejects merge-only mode for a remote batch merge-out before Git writes', async () => {
    const plan = remoteMergeOutPlan()
    const fetchRemote = vi.fn()
    const createWorktree = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      fetchRemote,
      createWorktree,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'merge',
        targets: [{ repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'origin/release/v2' } }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.git-action.remote-destination-requires-push',
    })
    expect(fetchRemote).not.toHaveBeenCalled()
    expect(createWorktree).not.toHaveBeenCalled()
  })

  test('cleans a remote temporary worktree when preparation reports a partial repository change', async () => {
    const plan = remoteMergeOutPlan()
    const removeWorktree = vi.fn(async () => ({ ok: true as const, message: 'removed' }))
    const merge = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      fetchRemote: vi.fn(async () => ({ ok: true as const, message: 'fetched' })),
      createWorktree: vi.fn(async () => ({
        ok: false as const,
        message: 'bootstrap failed',
        repoChanged: true,
      })),
      removeWorktree,
      merge,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: [{ repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'origin/release/v2' } }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [{ repositoryName: 'api', phase: 'failed', step: 'prepare', message: 'bootstrap failed' }],
    })
    expect(removeWorktree).toHaveBeenCalledTimes(1)
    expect(merge).not.toHaveBeenCalled()
  })

  test('pulls target branches serially, continues after a failure, and retries only failed members', async () => {
    const plan = syncPlan('pull', true, ['api', 'web', 'docs'])
    const pull = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'api failed' })
      .mockResolvedValueOnce({ ok: true, message: 'pulled web' })
      .mockResolvedValueOnce({ ok: false, message: 'docs failed' })
      .mockResolvedValueOnce({ ok: true, message: 'pulled api' })
      .mockResolvedValueOnce({ ok: true, message: 'pulled docs' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
    })
    await service.plan(ROOT, { kind: 'pull', branchWorkspaceId: 'ws-1' })
    const input = { kind: 'pull' as const, planToken: plan.token, repositoryNames: ['api', 'web', 'docs'] }

    await expect(service.execute(ROOT, input)).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'pull' },
        { repositoryName: 'web', phase: 'succeeded' },
        { repositoryName: 'docs', phase: 'failed', step: 'pull' },
      ],
    })
    await expect(service.execute(ROOT, input)).resolves.toMatchObject({ ok: true })
    expect(pull.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', 'feature/a', '/workspace/goblin-feature-a/api'],
      ['/workspace/web', 'feature/a', '/workspace/goblin-feature-a/web'],
      ['/workspace/docs', 'feature/a', '/workspace/goblin-feature-a/docs'],
      ['/workspace/api', 'feature/a', '/workspace/goblin-feature-a/api'],
      ['/workspace/docs', 'feature/a', '/workspace/goblin-feature-a/docs'],
    ])
  })

  test('pushes later members after failures and aggregates every failed push', async () => {
    const plan = syncPlan('push', true, ['api', 'web', 'docs'])
    const push = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'api rejected' })
      .mockResolvedValueOnce({ ok: true, message: 'pushed web' })
      .mockResolvedValueOnce({ ok: false, message: 'docs rejected' })
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      push,
    })
    await service.plan(ROOT, { kind: 'push', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'push', planToken: plan.token, repositoryNames: ['api', 'web', 'docs'] }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'push',
          message: 'api rejected',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        { repositoryName: 'web', phase: 'succeeded' },
        {
          repositoryName: 'docs',
          phase: 'failed',
          step: 'push',
          message: 'docs rejected',
          worktreePath: '/workspace/goblin-feature-a/docs',
        },
      ],
    })
    expect(push.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['/workspace/api', 'feature/a'],
      ['/workspace/web', 'feature/a'],
      ['/workspace/docs', 'feature/a'],
    ])
  })

  test('does not continue a coordinated sync after cancellation', async () => {
    const plan = syncPlan('pull', true, ['api', 'web', 'docs'])
    let service: ReturnType<typeof createBranchWorkspaceGitActionWriteService>
    const pull = vi.fn(async () => {
      service.abort(ROOT)
      return { ok: false as const, message: 'cancelled' }
    })
    service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
    })
    await service.plan(ROOT, { kind: 'pull', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'pull', planToken: plan.token, repositoryNames: ['api', 'web', 'docs'] }),
    ).resolves.toMatchObject({
      ok: false,
      message: 'cancelled',
    })
    expect(pull).toHaveBeenCalledTimes(1)
  })

  test('pushes every target branch serially', async () => {
    const plan = syncPlan('push')
    const calls: string[] = []
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      push: vi.fn(async (repoId, branch) => {
        calls.push(`${repoId}:${branch}`)
        return { ok: true, message: 'pushed' }
      }),
    })
    await service.plan(ROOT, { kind: 'push', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'push', planToken: plan.token, repositoryNames: ['api', 'web'] }),
    ).resolves.toMatchObject({ ok: true })
    expect(calls).toEqual(['/workspace/api:feature/a', '/workspace/web:feature/a'])
  })

  test('pushes selected ready members when another member is unavailable', async () => {
    const plan = syncPlan('push')
    if (plan.kind !== 'push') throw new Error('expected push plan')
    plan.ready = false
    plan.members[1]!.ready = false
    plan.members[1]!.message = 'workspace.branch-workspace.git-action.remote-required'
    const ignoredSets: string[][] = []
    const push = vi.fn(async () => ({ ok: true as const, message: 'pushed' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async (_plan, ignored) => {
        ignoredSets.push([...ignored])
        return { ok: true as const, plan }
      }),
      push,
    })
    await service.plan(ROOT, { kind: 'push', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind: 'push', planToken: plan.token, repositoryNames: ['api'] }),
    ).resolves.toMatchObject({
      ok: true,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'satisfied' },
      ],
    })
    expect(ignoredSets).toEqual([['web']])
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/workspace/api', 'feature/a', expect.any(AbortSignal), undefined, {
      publishInvalidation: false,
    })
  })

  test.each(['pull', 'push'] as const)('does not execute an unready %s plan', async (kind) => {
    const plan = syncPlan(kind, false)
    const pull = vi.fn()
    const push = vi.fn()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull,
      push,
    })
    await service.plan(ROOT, { kind, branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, { kind, planToken: plan.token, repositoryNames: ['api', 'web'] }),
    ).resolves.toMatchObject({
      ok: false,
      message:
        kind === 'pull'
          ? 'workspace.branch-workspace.git-action.target-upstream-required'
          : 'workspace.branch-workspace.git-action.remote-required',
    })
    expect(pull).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  test('rejects a batch when any dirty member message is missing before committing', async () => {
    const commit = vi.fn()
    const plan = batchPlan()
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi.fn(async () => ({ ok: true as const, plan })),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      commit,
    })
    await service.plan(ROOT, { kind: 'batch-commit', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-commit',
        planToken: plan.token,
        messages: [{ repositoryName: 'api', message: 'feat: api' }],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(commit).not.toHaveBeenCalled()
  })

  test('continues when pulling the selected destination updates its HEAD', async () => {
    const plan = mergeOutPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'batch-merge-out') changedPlan.members[0]!.destinationBranches[0]!.head = 'changed-head'
    const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
    const push = vi.fn(async () => ({ ok: true as const, message: 'pushed' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn(async () => ({ ok: true as const, plan }))
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(merge).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('continues later merge-out members when one destination changes after pull', async () => {
    const plan = mergeOutPlan()
    if (plan.kind !== 'batch-merge-out') throw new Error('expected merge plan')
    const sourceDirtyPlan = structuredClone(plan)
    sourceDirtyPlan.members[0]!.ready = false
    sourceDirtyPlan.members[0]!.message = 'workspace.branch-workspace.git-action.target-worktree-dirty'
    const destinationDirtyPlan = structuredClone(plan)
    destinationDirtyPlan.members[0]!.destinationBranches[0]!.ready = false
    destinationDirtyPlan.members[0]!.destinationBranches[0]!.message =
      'workspace.branch-workspace.git-action.destination-worktree-dirty'

    for (const changedPlan of [sourceDirtyPlan, destinationDirtyPlan]) {
      const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
      const push = vi.fn(async () => ({ ok: true as const, message: 'pushed' }))
      const service = createBranchWorkspaceGitActionWriteService({
        buildPlan: vi
          .fn()
          .mockResolvedValueOnce({ ok: true as const, plan })
          .mockResolvedValueOnce({ ok: true as const, plan: changedPlan })
          .mockResolvedValue({ ok: true as const, plan }),
        validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
        pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
        merge,
        push,
      })
      await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

      await expect(
        service.execute(ROOT, {
          kind: 'batch-merge-out',
          planToken: plan.token,
          mode: 'pull-merge-push',
          targets: mergeOutTargets(),
        }),
      ).resolves.toMatchObject({
        ok: false,
        message: 'workspace.branch-workspace.git-action.members-failed',
        members: [
          { repositoryName: 'api', phase: 'failed', step: 'merge' },
          { repositoryName: 'web', phase: 'succeeded' },
        ],
      })
      expect(merge).toHaveBeenCalledTimes(1)
      expect(push).toHaveBeenCalledTimes(1)
    }
  })

  test('continues later merge-out members when one target branch changes after pull', async () => {
    const plan = mergeOutPlan()
    const changedPlan = structuredClone(plan)
    if (changedPlan.kind === 'batch-merge-out') changedPlan.members[0]!.targetHead = 'changed-target-head'
    const merge = vi.fn(async () => ({ ok: true as const, message: 'merged' }))
    const push = vi.fn(async () => ({ ok: true as const, message: 'pushed' }))
    const service = createBranchWorkspaceGitActionWriteService({
      buildPlan: vi
        .fn()
        .mockResolvedValueOnce({ ok: true as const, plan })
        .mockResolvedValueOnce({ ok: true as const, plan: changedPlan })
        .mockResolvedValue({ ok: true as const, plan }),
      validatePlan: vi.fn(async () => ({ ok: true as const, plan })),
      pull: vi.fn(async () => ({ ok: true, message: 'pulled' })),
      merge,
      push,
    })
    await service.plan(ROOT, { kind: 'batch-merge-out', branchWorkspaceId: 'ws-1' })

    await expect(
      service.execute(ROOT, {
        kind: 'batch-merge-out',
        planToken: plan.token,
        mode: 'pull-merge-push',
        targets: mergeOutTargets(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge' },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    })
    expect(merge).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })
})
