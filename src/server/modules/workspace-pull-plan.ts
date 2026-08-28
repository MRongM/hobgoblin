import { createHash } from 'node:crypto'
import path from 'node:path'
import { getRepositorySnapshot } from '#/server/modules/repo-read-paths.ts'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { workspaceRepositoryId, workspaceRepositoryPath, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { WorkspacePullMemberPlan, WorkspacePullPlan, WorkspacePullPlanResult } from '#/shared/workspace-pull.ts'

export interface WorkspacePullPlanDependencies {
  readConfig?: (rootId: string) => Promise<WorkspaceConfigSnapshot>
  getSnapshot?: typeof getRepositorySnapshot
}

export async function buildWorkspacePullPlan(
  rootId: string,
  dependencies: WorkspacePullPlanDependencies = {},
  signal?: AbortSignal,
): Promise<WorkspacePullPlanResult> {
  const normalizedRootId = workspaceRootId(rootId)
  const config = await readResource(
    () => (dependencies.readConfig ?? readWorkspaceConfig)(normalizedRootId),
    'workspace.pull.repository-unavailable',
  )
  if (!config.ok) return config
  if (config.value.kind !== 'ready') {
    return {
      ok: false,
      message:
        config.value.kind === 'invalid' && config.value.message === 'error.ssh-config-changed'
          ? config.value.message
          : 'workspace.configuration-required',
    }
  }
  const repositoryIds = config.value.config.repo.map((name) => workspaceRepositoryId(normalizedRootId, name))
  if (repositoryIds.some((id) => !id)) return { ok: false, message: 'workspace.config.invalid-repository' }

  const members: WorkspacePullMemberPlan[] = []
  for (const repoId of repositoryIds as string[]) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const snapshot = await readResource(
      () =>
        (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
          includeWorktreeStatus: false,
          includeRemote: false,
        }),
      'workspace.pull.repository-unavailable',
    )
    if (!snapshot.ok) return snapshot
    const target = pullTarget(repoId, snapshot.value)
    if (!target) return { ok: false, message: 'workspace.pull.target-unavailable' }
    members.push(target)
  }
  const planWithoutToken = { rootId: normalizedRootId, members }
  return {
    ok: true,
    plan: {
      token: `sha256:${createHash('sha256').update(JSON.stringify(planWithoutToken), 'utf8').digest('hex')}`,
      ...planWithoutToken,
    },
  }
}

export async function validateWorkspacePullRetryPlan(
  plan: WorkspacePullPlan,
  _completedRepositoryIds: ReadonlySet<string>,
  dependencies: WorkspacePullPlanDependencies = {},
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = await buildWorkspacePullPlan(plan.rootId, dependencies, signal)
  if (!current.ok || current.plan.token !== plan.token) {
    return {
      ok: false,
      message:
        current.ok || current.message !== 'error.ssh-config-changed' ? 'workspace.pull.plan-stale' : current.message,
    }
  }
  return { ok: true }
}

function pullTarget(repoId: string, snapshot: RepoSnapshot | null): WorkspacePullMemberPlan | null {
  if (!snapshot) return null
  const rootBranch = snapshot.branches.find((branch) => branch.worktree && isPrimaryWorktree(repoId, branch.worktree))
  return rootBranch?.worktree?.path ? { repoId, branch: rootBranch.name, worktreePath: rootBranch.worktree.path } : null
}

function isPrimaryWorktree(repoId: string, worktree: { path: string; isPrimary?: boolean }): boolean {
  if (worktree.isPrimary === true) return true
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return false
  return isRemoteRepoId(repoId)
    ? path.posix.normalize(worktree.path) === path.posix.normalize(repositoryPath)
    : path.resolve(worktree.path) === path.resolve(repositoryPath)
}

async function readResource<T>(
  read: () => Promise<T>,
  fallback: string,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return {
      ok: false,
      message: message === 'error.ssh-config-changed' || message === 'cancelled' ? message : fallback,
    }
  }
}
