import { describe, expect, test, vi } from 'vitest'
import { buildWorkspacePullPlan, validateWorkspacePullRetryPlan } from '#/server/modules/workspace-pull-plan.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'

describe('workspace pull plan', () => {
  test('plans configured repositories in order using each primary worktree branch', async () => {
    const dependencies = deps({ [API]: snapshot(API, 'main'), [WEB]: snapshot(WEB, 'trunk') })

    const result = await buildWorkspacePullPlan(ROOT, dependencies)

    expect(result).toMatchObject({
      ok: true,
      plan: {
        rootId: ROOT,
        members: [
          { repoId: API, branch: 'main', worktreePath: API },
          { repoId: WEB, branch: 'trunk', worktreePath: WEB },
        ],
      },
    })
    if (!result.ok) return
    await expect(validateWorkspacePullRetryPlan(result.plan, new Set(), dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.getSnapshot).toHaveBeenCalledTimes(4)
    for (const [index, repoId] of [API, WEB, API, WEB].entries()) {
      expect(dependencies.getSnapshot).toHaveBeenNthCalledWith(index + 1, repoId, undefined, {
        includeWorktreeStatus: false,
        includeRemote: false,
      })
    }
  })

  test('fails explicitly when a configured repository has no primary pull target', async () => {
    const dependencies = deps({ [API]: { current: '', branches: [] }, [WEB]: snapshot(WEB, 'trunk') })

    await expect(buildWorkspacePullPlan(ROOT, dependencies)).resolves.toEqual({
      ok: false,
      message: 'workspace.pull.target-unavailable',
    })
  })
})

function deps(snapshots: Record<string, RepoSnapshot>) {
  return {
    readConfig: vi.fn(async (): Promise<WorkspaceConfigSnapshot> => ({
      kind: 'ready',
      config: { repo: ['api', 'web'] },
    })),
    getSnapshot: vi.fn(async (repoId: string) => snapshots[repoId] ?? null),
  }
}

function snapshot(root: string, branch: string): RepoSnapshot {
  return {
    current: branch,
    branches: [
      {
        name: branch,
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
    ],
  }
}
