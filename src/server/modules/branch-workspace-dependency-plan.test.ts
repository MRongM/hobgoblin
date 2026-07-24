import { describe, expect, test, vi } from 'vitest'
import {
  buildBranchWorkspaceDependencyPlan,
  readBranchWorkspaceDependencyCandidates,
  type BranchWorkspaceDependencyPlanDependencies,
} from '#/server/modules/branch-workspace-dependency-plan.ts'
import type { BranchWorkspaceReadResult, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

const ROOT = '/workspace'
const TARGET_ROOT = '/workspace/hobgoblin-feature-auth'

describe('branch workspace dependency plans', () => {
  test('classifies live root candidates by same-named target presence', async () => {
    const dependencies = planDependencies()

    await expect(readBranchWorkspaceDependencyCandidates(ROOT, 'branch-1', undefined, dependencies)).resolves.toEqual({
      ok: true,
      rootId: ROOT,
      branchWorkspaceId: 'branch-1',
      candidates: [
        {
          name: '.env',
          sourcePath: '/workspace/.env',
          sourceKind: 'file',
          targetPath: `${TARGET_ROOT}/.env`,
          targetKind: 'missing',
          outsideRoot: true,
        },
        {
          name: 'config',
          sourcePath: '/workspace/config',
          sourceKind: 'directory',
          targetPath: `${TARGET_ROOT}/config`,
          targetKind: 'directory',
          outsideRoot: false,
        },
      ],
    })
  })

  test('rejects dependency maintenance for a non-ready branch workspace', async () => {
    const dependencies = planDependencies({
      ...workspace(),
      state: { kind: 'needs-action', action: 'repair', reason: 'drift' },
    })

    await expect(readBranchWorkspaceDependencyCandidates(ROOT, 'branch-1', undefined, dependencies)).resolves.toEqual({
      ok: false,
      message: 'workspace.branch-workspace.dependency.not-ready',
    })
  })

  test('builds an add plan only for missing targets and requires outside-root approval', async () => {
    const dependencies = planDependencies()
    const result = await buildBranchWorkspaceDependencyPlan(
      ROOT,
      {
        operation: 'add',
        branchWorkspaceId: 'branch-1',
        entries: [{ name: '.env', mode: 'copy' }],
      },
      dependencies,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        token: expect.stringMatching(/^sha256:/),
        rootId: ROOT,
        operation: 'add',
        branchWorkspaceId: 'branch-1',
        requiredApprovals: ['outside-root-source'],
        entries: [
          {
            name: '.env',
            mode: 'copy',
            sourcePath: '/workspace/.env',
            sourceKind: 'file',
            targetPath: `${TARGET_ROOT}/.env`,
            outsideRoot: true,
          },
        ],
      },
    })
    expect(dependencies.fingerprintEntry).not.toHaveBeenCalled()
  })

  test('rejects adding an occupied target', async () => {
    await expect(
      buildBranchWorkspaceDependencyPlan(
        ROOT,
        {
          operation: 'add',
          branchWorkspaceId: 'branch-1',
          entries: [{ name: 'config', mode: 'symlink' }],
        },
        planDependencies(),
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.dependency.target-exists' })
  })

  test('builds a remove plan with a fingerprint bound to each present target', async () => {
    const dependencies = planDependencies()
    const result = await buildBranchWorkspaceDependencyPlan(
      ROOT,
      { operation: 'remove', branchWorkspaceId: 'branch-1', names: ['config'] },
      dependencies,
    )

    expect(result).toMatchObject({
      ok: true,
      plan: {
        token: expect.stringMatching(/^sha256:/),
        rootId: ROOT,
        operation: 'remove',
        branchWorkspaceId: 'branch-1',
        requiredApprovals: [],
        entries: [
          {
            name: 'config',
            sourcePath: '/workspace/config',
            targetPath: `${TARGET_ROOT}/config`,
            targetKind: 'directory',
            fingerprint: 'fingerprint:config',
          },
        ],
      },
    })
    expect(dependencies.fingerprintEntry).toHaveBeenCalledWith(ROOT, `${TARGET_ROOT}/config`, undefined)
  })

  test('rejects removing a missing target or an unknown source candidate', async () => {
    await expect(
      buildBranchWorkspaceDependencyPlan(
        ROOT,
        { operation: 'remove', branchWorkspaceId: 'branch-1', names: ['.env'] },
        planDependencies(),
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.dependency.target-missing' })

    await expect(
      buildBranchWorkspaceDependencyPlan(
        ROOT,
        { operation: 'remove', branchWorkspaceId: 'branch-1', names: ['notes.txt'] },
        planDependencies(),
      ),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.dependency.unavailable' })
  })
})

function planDependencies(item: BranchWorkspaceSnapshot = workspace()): Required<BranchWorkspaceDependencyPlanDependencies> {
  const readSnapshot = vi.fn(async (): Promise<BranchWorkspaceReadResult> => ({
    ok: true,
    rootId: ROOT,
    items: [item],
    auxiliaryCandidates: [
      {
        name: '.env',
        path: '/workspace/.env',
        kind: 'file',
        resolvedPath: '/outside/.env',
        outsideRoot: true,
      },
      {
        name: 'config',
        path: '/workspace/config',
        kind: 'directory',
        resolvedPath: '/workspace/config',
        outsideRoot: false,
      },
    ],
  }))
  const inspectPath = vi.fn(async (_rootId: string, candidatePath: string) => ({
    path: candidatePath,
    exists: candidatePath.endsWith('/config'),
    kind: candidatePath.endsWith('/config') ? ('directory' as const) : ('missing' as const),
    directChild: false,
    outsideRoot: false,
  }))
  const fingerprintEntry = vi.fn(async (_rootId: string, candidatePath: string) =>
    `fingerprint:${candidatePath.split('/').at(-1)}`,
  )
  return { readSnapshot, inspectPath, fingerprintEntry }
}

function workspace(): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: ROOT,
    branch: 'feature/auth',
    directoryName: 'hobgoblin-feature-auth',
    path: TARGET_ROOT,
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
  }
}
