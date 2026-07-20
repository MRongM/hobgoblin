import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  buildWorkspaceWorktreePlan,
  validateWorkspaceWorktreeRetryPlan,
} from '#/server/modules/workspace-worktree-plan.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import type { WorkspaceWorktreePlan } from '#/shared/workspace-worktrees.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'

function snapshot(
  root: string,
  rootBranch: string,
  localBranches: string[] = [],
  linked: Array<{ branch: string; path: string; dirty?: boolean; locked?: boolean; tracking?: string }> = [],
): RepoSnapshot {
  return {
    current: rootBranch,
    branches: [
      {
        name: rootBranch,
        isCurrent: true,
        isDefault: true,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'abc',
        lastCommitMessage: '',
        lastCommitDate: '',
        lastCommitAuthor: '',
        worktree: { path: root, isPrimary: true },
      },
      ...localBranches.map((branch) => ({
        name: branch,
        isCurrent: false,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'base',
        lastCommitMessage: '',
        lastCommitDate: '',
        lastCommitAuthor: '',
      })),
      ...linked.map((entry) => ({
        name: entry.branch,
        isCurrent: false,
        tracking: entry.tracking,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'def',
        lastCommitMessage: '',
        lastCommitDate: '',
        lastCommitAuthor: '',
        worktree: {
          path: entry.path,
          isPrimary: false,
          isLocked: entry.locked,
          summary: { dirty: entry.dirty, changeCount: entry.dirty ? 1 : 0 },
        },
      })),
    ],
  }
}

function dependencies(snapshots: Record<string, RepoSnapshot | null>) {
  return {
    readConfig: vi.fn(async (): Promise<WorkspaceConfigSnapshot> => ({
      kind: 'ready' as const,
      config: { repo: ['api', 'web'] },
    })),
    getSnapshot: vi.fn(async (repoId: string) => snapshots[repoId] ?? null),
    getStatus: vi.fn(async () => []),
    getBootstrapPreview: vi.fn(async (repoId: string) => ({
      ok: true as const,
      preview: {
        hasConfig: repoId === API,
        hasOperations: repoId === API,
        configHash: repoId === API ? 'sha256:api' : null,
        copyCount: repoId === API ? 1 : 0,
        symlinkCount: 0,
        hardlinkCount: 0,
        excludeCount: 0,
      },
    })),
    pathExists: vi.fn(async () => false),
  }
}

describe('workspace worktree plan', () => {
  test('plans remote members without treating remote ids as filesystem paths', async () => {
    const remoteRoot = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    const remoteApi = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace/api' })
    const apiSnapshot = snapshot('/srv/workspace/api', 'main', ['develop'])
    apiSnapshot.branches[0]!.worktree!.isPrimary = undefined
    const deps = dependencies({ [remoteApi]: apiSnapshot })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    const result = await buildWorkspaceWorktreePlan(
      remoteRoot,
      { operation: 'create', branch: 'feature/remote', baseBranch: 'develop' },
      deps,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        rootId: remoteRoot,
        members: [{ repoId: remoteApi, worktreePath: '/srv/workspace/api-feature-remote' }],
      },
    })
    expect(deps.pathExists).toHaveBeenCalledWith(remoteApi, '/srv/workspace/api-feature-remote')
    if (!result.ok) return

    deps.pathExists.mockClear()
    await expect(validateWorkspaceWorktreeRetryPlan(result.plan, new Set(), deps)).resolves.toEqual({ ok: true })
    expect(deps.pathExists).toHaveBeenCalledWith(remoteApi, '/srv/workspace/api-feature-remote')
  })

  test('validates remote retry membership and recognizes the physical repository root worktree', async () => {
    const remoteRoot = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    const remoteApi = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace/api' })
    const apiSnapshot = snapshot('/srv/workspace/api', 'main')
    apiSnapshot.branches[0]!.worktree!.isPrimary = undefined
    const deps = dependencies({ [remoteApi]: apiSnapshot })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    const planned = await buildWorkspaceWorktreePlan(remoteRoot, { operation: 'pull' }, deps)
    expect(planned).toMatchObject({
      ok: true,
      plan: { rootId: remoteRoot, members: [{ repoId: remoteApi, worktreePath: '/srv/workspace/api' }] },
    })
    if (!planned.ok) return
    await expect(validateWorkspaceWorktreeRetryPlan(planned.plan, new Set(), deps)).resolves.toEqual({ ok: true })
  })

  test('rejects remote repository roots as removal targets even when the primary flag is absent', async () => {
    const remoteRoot = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    const remoteApi = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace/api' })
    const apiSnapshot = snapshot(
      '/srv/workspace/api',
      'main',
      [],
      [{ branch: 'feature/a', path: '/srv/workspace/api' }],
    )
    apiSnapshot.branches.at(-1)!.worktree!.isPrimary = undefined
    const deps = dependencies({ [remoteApi]: apiSnapshot })
    deps.readConfig.mockResolvedValue({ kind: 'ready', config: { repo: ['api'] } })

    await expect(
      buildWorkspaceWorktreePlan(
        remoteRoot,
        { operation: 'remove', branch: 'feature/a', alsoDeleteBranch: false, alsoDeleteUpstream: false },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.worktree.remove-unsafe' })

    const retryPlan: WorkspaceWorktreePlan = {
      token: 'sha256:test',
      rootId: remoteRoot,
      operation: 'remove',
      branch: 'feature/a',
      removalOptions: { alsoDeleteBranch: false, alsoDeleteUpstream: false },
      members: [{ repoId: remoteApi, branch: 'feature/a', worktreePath: '/srv/workspace/api' }],
    }
    await expect(validateWorkspaceWorktreeRetryPlan(retryPlan, new Set(), deps)).resolves.toEqual({
      ok: false,
      message: 'workspace.worktree.plan-stale',
    })
  })

  test('plans same-name branches in configured order from the selected shared base', async () => {
    const deps = dependencies({
      [API]: snapshot(API, 'main', ['develop']),
      [WEB]: snapshot(WEB, 'trunk', ['develop']),
    })

    const request = { operation: 'create' as const, branch: 'feature/a', baseBranch: 'develop' }
    const result = await buildWorkspaceWorktreePlan(ROOT, request, deps)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.members).toMatchObject([
      {
        repoId: API,
        baseRef: 'develop',
        worktreePath: path.join(ROOT, 'api-feature-a'),
        worktreeBootstrap: { kind: 'run', configHash: 'sha256:api', configTrusted: false },
        confirmationRequired: true,
      },
      {
        repoId: WEB,
        baseRef: 'develop',
        worktreePath: path.join(ROOT, 'web-feature-a'),
        worktreeBootstrap: { kind: 'skip' },
        confirmationRequired: false,
      },
    ])
    expect(result.plan.token).toMatch(/^sha256:/)
    await expect(buildWorkspaceWorktreePlan(ROOT, request, deps)).resolves.toEqual(result)
  })

  test('plans exact linked worktree and optional branch removal in configured order', async () => {
    const deps = dependencies({
      [API]: snapshot(
        API,
        'main',
        [],
        [{ branch: 'feature/a', path: '/worktrees/api-feature-a', tracking: 'origin/feature/a' }],
      ),
      [WEB]: snapshot(
        WEB,
        'trunk',
        [],
        [{ branch: 'feature/a', path: '/worktrees/web-feature-a', tracking: 'upstream/feature/a' }],
      ),
    })

    const result = await buildWorkspaceWorktreePlan(
      ROOT,
      { operation: 'remove', branch: 'feature/a', alsoDeleteBranch: true, alsoDeleteUpstream: true },
      deps,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.members.map((member) => member.repoId)).toEqual([API, WEB])
    expect(result.plan.members.map((member) => member.worktreePath)).toEqual([
      '/worktrees/api-feature-a',
      '/worktrees/web-feature-a',
    ])
    expect(result.plan.members.map((member) => member.upstream)).toEqual(['origin/feature/a', 'upstream/feature/a'])
    expect(result.plan.removalOptions).toEqual({ alsoDeleteBranch: true, alsoDeleteUpstream: true })
  })

  test('plans pull for each repository root worktree and its own current branch', async () => {
    const deps = dependencies({ [API]: snapshot(API, 'main'), [WEB]: snapshot(WEB, 'trunk') })

    const result = await buildWorkspaceWorktreePlan(ROOT, { operation: 'pull' }, deps)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        operation: 'pull',
        members: [
          { repoId: API, branch: 'main', worktreePath: API },
          { repoId: WEB, branch: 'trunk', worktreePath: WEB },
        ],
      },
    })
  })

  test.each([
    [
      'unsafe branch',
      { operation: 'create' as const, branch: '../feature', baseBranch: 'main' },
      'workspace.worktree.invalid-branch',
    ],
    [
      'missing repository',
      { operation: 'create' as const, branch: 'feature/a', baseBranch: 'main' },
      'workspace.worktree.repository-unavailable',
    ],
  ])('rejects %s before writes', async (_label, request, message) => {
    const deps = dependencies({ [API]: snapshot(API, 'main'), [WEB]: null })

    await expect(buildWorkspaceWorktreePlan(ROOT, request, deps)).resolves.toEqual({ ok: false, message })
  })

  test('rejects dirty or locked removal targets', async () => {
    const deps = dependencies({
      [API]: snapshot(API, 'main', [], [{ branch: 'feature/a', path: '/worktrees/api-feature-a' }]),
      [WEB]: snapshot(
        WEB,
        'trunk',
        [],
        [{ branch: 'feature/a', path: '/worktrees/web-feature-a', dirty: true, locked: true }],
      ),
    })

    await expect(
      buildWorkspaceWorktreePlan(
        ROOT,
        {
          operation: 'remove',
          branch: 'feature/a',
          alsoDeleteBranch: false,
          alsoDeleteUpstream: false,
        },
        deps,
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'workspace.worktree.remove-unsafe',
    })
  })

  test('treats path existence transport failures as unavailable or stale instead of absent', async () => {
    const deps = dependencies({ [API]: snapshot(API, 'main'), [WEB]: snapshot(WEB, 'main') })
    deps.pathExists.mockRejectedValue(new Error('timeout'))

    await expect(
      buildWorkspaceWorktreePlan(ROOT, { operation: 'create', branch: 'feature/a', baseBranch: 'main' }, deps),
    ).resolves.toEqual({ ok: false, message: 'workspace.worktree.repository-unavailable' })

    const retryPlan: WorkspaceWorktreePlan = {
      token: 'sha256:test',
      rootId: ROOT,
      operation: 'create',
      branch: 'feature/a',
      members: [
        {
          repoId: API,
          branch: 'feature/a',
          baseRef: 'main',
          worktreePath: path.join(ROOT, 'api-feature-a'),
        },
        {
          repoId: WEB,
          branch: 'feature/a',
          baseRef: 'main',
          worktreePath: path.join(ROOT, 'web-feature-a'),
        },
      ],
    }
    await expect(validateWorkspaceWorktreeRetryPlan(retryPlan, new Set(), deps)).resolves.toEqual({
      ok: false,
      message: 'workspace.worktree.plan-stale',
    })
  })

  test('returns structured SSH config errors from remote worktree planning resources', async () => {
    const configChanged = new Error('error.ssh-config-changed')
    const configDependencies = dependencies({ [API]: snapshot(API, 'main'), [WEB]: snapshot(WEB, 'main') })
    configDependencies.readConfig.mockResolvedValue({ kind: 'invalid', message: configChanged.message })

    await expect(
      buildWorkspaceWorktreePlan(
        ROOT,
        { operation: 'create', branch: 'feature/a', baseBranch: 'main' },
        configDependencies,
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })

    const snapshotDependencies = dependencies({ [API]: snapshot(API, 'main'), [WEB]: snapshot(WEB, 'main') })
    snapshotDependencies.getSnapshot.mockRejectedValue(configChanged)
    await expect(
      buildWorkspaceWorktreePlan(
        ROOT,
        { operation: 'create', branch: 'feature/a', baseBranch: 'main' },
        snapshotDependencies,
      ),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })

    const retryPlan: WorkspaceWorktreePlan = {
      token: 'sha256:test',
      rootId: ROOT,
      operation: 'pull',
      branch: '',
      members: [
        { repoId: API, branch: 'main', worktreePath: API },
        { repoId: WEB, branch: 'main', worktreePath: WEB },
      ],
    }
    await expect(validateWorkspaceWorktreeRetryPlan(retryPlan, new Set(), snapshotDependencies)).resolves.toEqual({
      ok: false,
      message: 'error.ssh-config-changed',
    })
  })

  test('accepts exact partial creation state and rejects configuration drift before retry', async () => {
    const initialDependencies = dependencies({
      [API]: snapshot(API, 'main'),
      [WEB]: snapshot(WEB, 'trunk', ['main']),
    })
    const planned = await buildWorkspaceWorktreePlan(
      ROOT,
      { operation: 'create', branch: 'feature/a', baseBranch: 'main' },
      initialDependencies,
    )
    expect(planned.ok).toBe(true)
    if (!planned.ok) return
    const apiAfterCreate = snapshot(API, 'main', [], [{ branch: 'feature/a', path: path.join(ROOT, 'api-feature-a') }])
    const retryDependencies = dependencies({ [API]: apiAfterCreate, [WEB]: snapshot(WEB, 'trunk', ['main']) })

    await expect(validateWorkspaceWorktreeRetryPlan(planned.plan, new Set([API]), retryDependencies)).resolves.toEqual({
      ok: true,
    })

    retryDependencies.readConfig.mockResolvedValue({
      kind: 'ready',
      config: { repo: ['web', 'api'] },
    })
    await expect(validateWorkspaceWorktreeRetryPlan(planned.plan, new Set([API]), retryDependencies)).resolves.toEqual({
      ok: false,
      message: 'workspace.worktree.plan-stale',
    })
  })
})
