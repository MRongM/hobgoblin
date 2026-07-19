import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { getRepositorySnapshot, getRepositoryStatus } from '#/server/modules/repo-read-paths.ts'
import { getRepositoryWorktreeBootstrapPreview } from '#/server/modules/repo-write-paths.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import type { WorktreeStatus } from '#/shared/git-types.ts'
import type { WorktreeBootstrapPreviewResult } from '#/shared/worktree-bootstrap-summary.ts'
import type {
  WorkspaceWorktreeMemberPlan,
  WorkspaceWorktreePlan,
  WorkspaceWorktreePlanRequest,
  WorkspaceWorktreePlanResult,
  WorkspaceWorktreeRemovalOptions,
} from '#/shared/workspace-worktrees.ts'

export interface WorkspaceWorktreePlanDependencies {
  readConfig?: (rootId: string) => Promise<WorkspaceConfigSnapshot>
  getSnapshot?: (repoId: string, signal?: AbortSignal) => Promise<RepoSnapshot | null>
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
  getBootstrapPreview?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeBootstrapPreviewResult>
  pathExists?: (candidatePath: string) => Promise<boolean>
}

export async function buildWorkspaceWorktreePlan(
  rootId: string,
  request: WorkspaceWorktreePlanRequest,
  dependencies: WorkspaceWorktreePlanDependencies = {},
  signal?: AbortSignal,
): Promise<WorkspaceWorktreePlanResult> {
  if (request.operation !== 'pull' && !isSafeBranchName(request.branch)) {
    return { ok: false, message: 'workspace.worktree.invalid-branch' }
  }
  if (request.operation === 'create' && !isSafeBranchName(request.baseBranch)) {
    return { ok: false, message: 'workspace.worktree.base-unavailable' }
  }
  const readConfig = dependencies.readConfig ?? readWorkspaceConfig
  const configSnapshot = await readConfig(rootId)
  if (configSnapshot.kind !== 'ready') return { ok: false, message: 'workspace.configuration-required' }

  const configuredIds = configSnapshot.config.repo.map((name) => path.join(rootId, name))
  const removalOptions = request.operation === 'remove' ? normalizeRemovalOptions(request) : undefined
  const members: WorkspaceWorktreeMemberPlan[] = []
  for (const repoId of configuredIds) {
    if (signal?.aborted) return { ok: false, message: 'cancelled' }
    const member =
      request.operation === 'create'
        ? await planCreateMember(repoId, request.branch, request.baseBranch, dependencies, signal)
        : request.operation === 'remove'
          ? await planRemoveMember(repoId, request.branch, removalOptions!.alsoDeleteUpstream, dependencies, signal)
          : await planPullMember(repoId, dependencies, signal)
    if (!member.ok) return member
    members.push(member.member)
  }

  const planWithoutToken = {
    rootId: path.resolve(rootId),
    operation: request.operation,
    branch: request.operation === 'pull' ? '' : request.branch,
    ...(removalOptions ? { removalOptions } : {}),
    members,
  }
  const token = planToken(planWithoutToken)
  return { ok: true, plan: { token, ...planWithoutToken } }
}

export async function validateWorkspaceWorktreeRetryPlan(
  plan: WorkspaceWorktreePlan,
  completedRepositoryIds: ReadonlySet<string>,
  dependencies: WorkspaceWorktreePlanDependencies = {},
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const configSnapshot = await (dependencies.readConfig ?? readWorkspaceConfig)(plan.rootId)
  if (configSnapshot.kind !== 'ready') return { ok: false, message: 'workspace.worktree.plan-stale' }
  const configuredIds = configSnapshot.config.repo.map((name) => path.join(plan.rootId, name))
  const plannedIds = plan.members.map((member) => member.repoId)
  if (
    configuredIds.length !== plannedIds.length ||
    configuredIds.some((repoId, index) => repoId !== plannedIds[index])
  ) {
    return { ok: false, message: 'workspace.worktree.plan-stale' }
  }

  for (const member of plan.members) {
    const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(member.repoId, signal)
    if (!snapshot) return { ok: false, message: 'workspace.worktree.plan-stale' }
    const branch = snapshot.branches.find((candidate) => candidate.name === member.branch)
    if (plan.operation === 'pull') {
      if (branch?.worktree?.path !== member.worktreePath || !isRootWorktree(member.repoId, branch.worktree)) {
        return { ok: false, message: 'workspace.worktree.plan-stale' }
      }
      continue
    }
    if (plan.operation === 'create') {
      if (completedRepositoryIds.has(member.repoId)) {
        if (branch?.worktree?.path !== member.worktreePath) {
          return { ok: false, message: 'workspace.worktree.plan-stale' }
        }
      } else {
        if (branch || !member.baseRef || !snapshot.branches.some((candidate) => candidate.name === member.baseRef)) {
          return { ok: false, message: 'workspace.worktree.plan-stale' }
        }
        if (await (dependencies.pathExists ?? fileExists)(member.worktreePath)) {
          return { ok: false, message: 'workspace.worktree.plan-stale' }
        }
      }
      continue
    }

    if (completedRepositoryIds.has(member.repoId)) {
      if (branch?.worktree?.path === member.worktreePath) {
        return { ok: false, message: 'workspace.worktree.plan-stale' }
      }
      continue
    }
    if (plan.removalOptions?.alsoDeleteUpstream && branch?.tracking !== member.upstream) {
      return { ok: false, message: 'workspace.worktree.plan-stale' }
    }
    if (branch?.worktree?.path !== member.worktreePath || branch.worktree.isPrimary || branch.worktree.isLocked) {
      return { ok: false, message: 'workspace.worktree.plan-stale' }
    }
    const statuses = await (dependencies.getStatus ?? getRepositoryStatus)(member.repoId, signal)
    const status = statuses.find((entry) => entry.path === member.worktreePath)
    if ((status?.entries.length ?? branch.worktree.summary?.changeCount ?? 0) > 0 || branch.worktree.summary?.dirty) {
      return { ok: false, message: 'workspace.worktree.plan-stale' }
    }
  }
  return { ok: true }
}

function planToken(plan: Omit<WorkspaceWorktreePlan, 'token'>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(plan), 'utf8').digest('hex')}`
}

async function planCreateMember(
  repoId: string,
  branch: string,
  baseBranch: string,
  dependencies: WorkspaceWorktreePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; member: WorkspaceWorktreeMemberPlan } | { ok: false; message: string }> {
  const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal)
  if (!snapshot) return { ok: false, message: 'workspace.worktree.repository-unavailable' }
  if (snapshot.branches.some((candidate) => candidate.name === branch)) {
    return { ok: false, message: 'workspace.worktree.branch-exists' }
  }
  const base = snapshot.branches.find((candidate) => candidate.name === baseBranch)
  if (!base) return { ok: false, message: 'workspace.worktree.base-unavailable' }
  const worktreePath = defaultWorkspaceWorktreePath(repoId, branch)
  const pathExists = dependencies.pathExists ?? fileExists
  if (await pathExists(worktreePath)) return { ok: false, message: 'workspace.worktree.path-exists' }
  const bootstrap = await (dependencies.getBootstrapPreview ?? getRepositoryWorktreeBootstrapPreview)(repoId, signal)
  if (!bootstrap.ok) return { ok: false, message: bootstrap.message }
  const runBootstrap = bootstrap.preview.hasOperations && !!bootstrap.preview.configHash
  return {
    ok: true,
    member: {
      repoId,
      branch,
      baseRef: base.name,
      worktreePath,
      worktreeBootstrap: runBootstrap
        ? { kind: 'run', configHash: bootstrap.preview.configHash!, configTrusted: false }
        : { kind: 'skip' },
      bootstrapPreview: bootstrap.preview,
      confirmationRequired: runBootstrap,
    },
  }
}

async function planPullMember(
  repoId: string,
  dependencies: WorkspaceWorktreePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; member: WorkspaceWorktreeMemberPlan } | { ok: false; message: string }> {
  const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal)
  if (!snapshot) return { ok: false, message: 'workspace.worktree.repository-unavailable' }
  const rootBranch = snapshot.branches.find(
    (candidate) => !!candidate.worktree && isRootWorktree(repoId, candidate.worktree),
  )
  if (!rootBranch?.worktree?.path) return { ok: false, message: 'workspace.worktree.pull-target-unavailable' }
  return {
    ok: true,
    member: { repoId, branch: rootBranch.name, worktreePath: rootBranch.worktree.path },
  }
}

async function planRemoveMember(
  repoId: string,
  branch: string,
  includeUpstream: boolean,
  dependencies: WorkspaceWorktreePlanDependencies,
  signal?: AbortSignal,
): Promise<{ ok: true; member: WorkspaceWorktreeMemberPlan } | { ok: false; message: string }> {
  const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal)
  if (!snapshot) return { ok: false, message: 'workspace.worktree.repository-unavailable' }
  const candidate = snapshot.branches.find((entry) => entry.name === branch)
  const worktree = candidate?.worktree
  if (!worktree) return { ok: false, message: 'workspace.worktree.target-missing' }
  const statuses = await (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal)
  const status = statuses.find((entry) => entry.path === worktree.path)
  const dirty = (status?.entries.length ?? worktree.summary?.changeCount ?? 0) > 0 || worktree.summary?.dirty === true
  const locked = worktree.isLocked === true
  if (worktree.isPrimary || dirty || locked) return { ok: false, message: 'workspace.worktree.remove-unsafe' }
  return {
    ok: true,
    member: {
      repoId,
      branch,
      worktreePath: worktree.path,
      ...(includeUpstream && candidate.tracking ? { upstream: candidate.tracking } : {}),
      dirty,
      locked,
    },
  }
}

function normalizeRemovalOptions(
  request: Extract<WorkspaceWorktreePlanRequest, { operation: 'remove' }>,
): WorkspaceWorktreeRemovalOptions {
  const alsoDeleteBranch = request.alsoDeleteBranch === true
  return {
    alsoDeleteBranch,
    alsoDeleteUpstream: alsoDeleteBranch && request.alsoDeleteUpstream === true,
  }
}

export function defaultWorkspaceWorktreePath(repoId: string, branch: string): string {
  return path.join(path.dirname(repoId), `${path.basename(repoId)}-${branch.replaceAll('/', '-')}`)
}

function isRootWorktree(repoId: string, worktree: { path: string; isPrimary?: boolean }): boolean {
  return worktree.isPrimary === true || path.resolve(worktree.path) === path.resolve(repoId)
}

async function fileExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath)
    return true
  } catch {
    return false
  }
}
