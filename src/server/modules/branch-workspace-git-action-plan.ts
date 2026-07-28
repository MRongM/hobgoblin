import { createHash } from 'node:crypto'
import path from 'node:path'
import { isBranchWorkspaceBatchMergeTemporaryWorktreePath } from '#/server/modules/branch-workspace-batch-merge-worktree.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { workspaceRepositoryId, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { getRepositoryPatch, getRepositorySnapshot, getRepositoryStatus } from '#/server/modules/repo-read-paths.ts'
import {
  normalizeBranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceBatchCommitMemberPlan,
  type BranchWorkspaceBatchMergeInMemberPlan,
  type BranchWorkspaceBatchMergeInSourcePlan,
  type BranchWorkspaceBatchMergeOutDestinationPlan,
  type BranchWorkspaceBatchMergeOutMemberPlan,
  type BranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceGitActionPlanResult,
  type BranchWorkspaceSyncMemberPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { ExecResult, StatusEntry, WorktreeStatus } from '#/shared/git-types.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

export interface BranchWorkspaceGitActionPlanDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  getSnapshot?: (repoId: string, signal?: AbortSignal) => Promise<RepoSnapshot | null>
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
  getPatch?: (repoId: string, worktreePath: string, signal?: AbortSignal) => Promise<ExecResult>
}

export async function buildBranchWorkspaceGitActionPlan(
  rootId: string,
  request: BranchWorkspaceGitActionPlanRequest,
  dependencies: BranchWorkspaceGitActionPlanDependencies = {},
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const normalized = normalizeBranchWorkspaceGitActionPlanRequest(request)
  if (!normalized.ok) return normalized

  try {
    signal?.throwIfAborted()
    const normalizedRootId = workspaceRootId(rootId)
    const source = await (dependencies.readManifests ?? readBranchWorkspaceManifests)(normalizedRootId)
    if (source.kind === 'invalid') return { ok: false, message: source.message }
    const manifest =
      source.kind === 'ready'
        ? source.manifests.find((candidate) => candidate.id === normalized.request.branchWorkspaceId)
        : undefined
    const unavailable = validateManifest(manifest)
    if (unavailable) return unavailable
    if (!manifest) return { ok: false, message: 'workspace.branch-workspace.manifest-missing' }

    if (normalized.request.kind === 'batch-commit') {
      return await buildBatchCommitPlan(normalizedRootId, manifest, dependencies, signal)
    }
    if (normalized.request.kind === 'batch-merge-in') {
      return await buildBatchMergeInPlan(normalizedRootId, manifest, dependencies, signal)
    }
    if (normalized.request.kind === 'batch-merge-out') {
      return await buildBatchMergeOutPlan(normalizedRootId, manifest, dependencies, signal)
    }
    return await buildSyncPlan(normalizedRootId, manifest, normalized.request.kind, dependencies, signal)
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
}

export async function validateBranchWorkspaceGitActionPlan(
  expected: BranchWorkspaceGitActionPlan,
  completedRepositoryNames: ReadonlySet<string>,
  dependencies: BranchWorkspaceGitActionPlanDependencies = {},
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const current = await buildBranchWorkspaceGitActionPlan(
    expected.rootId,
    { kind: expected.kind, branchWorkspaceId: expected.branchWorkspaceId },
    dependencies,
    signal,
  )
  if (!current.ok) return current

  if (
    current.plan.kind !== expected.kind ||
    current.plan.members.length !== expected.members.length ||
    current.plan.members.some((member, index) => member.repositoryName !== expected.members[index]?.repositoryName)
  ) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' }
  }
  const currentMembers = new Map(current.plan.members.map((member) => [member.repositoryName, member]))
  for (const member of expected.members) {
    if (completedRepositoryNames.has(member.repositoryName)) continue
    if (currentMembers.get(member.repositoryName)?.fingerprint !== member.fingerprint) {
      return {
        ok: false,
        message: 'workspace.branch-workspace.git-action.repository-changed',
        repositoryName: member.repositoryName,
      }
    }
  }
  return current
}

function validateManifest(manifest: BranchWorkspaceManifest | undefined): { ok: false; message: string } | null {
  if (!manifest) return { ok: false, message: 'workspace.branch-workspace.manifest-missing' }
  if (manifest.operation || manifest.repositories.some((member) => member.progress !== 'complete')) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.not-ready' }
  }
  if (manifest.repositories.length === 0) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.no-repositories' }
  }
  return null
}

async function buildBatchCommitPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const members: BranchWorkspaceBatchCommitMemberPlan[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      signal,
    )
    if (!facts.ok) return facts
    const patch = await (dependencies.getPatch ?? getRepositoryPatch)(facts.repoId, member.worktreePath, signal)
    if (!patch.ok) {
      return {
        ok: false,
        message: patch.message || 'workspace.branch-workspace.git-action.read-failed',
        repositoryName: member.repositoryName,
      }
    }
    const entries = normalizedEntries(facts.status.entries)
    members.push({
      repositoryName: member.repositoryName,
      repoId: facts.repoId,
      targetBranch: member.targetBranch,
      targetWorktreePath: member.worktreePath,
      dirty: entries.length > 0,
      changeCount: entries.length,
      fingerprint: fingerprint({ head: facts.head, status: entries, patch: patch.message }),
    })
  }
  const planWithoutToken = {
    kind: 'batch-commit' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: fingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildBatchMergeInPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const members: BranchWorkspaceBatchMergeInMemberPlan[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      signal,
    )
    if (!facts.ok) return facts
    const targetEntries = normalizedEntries(facts.status.entries)
    const targetBranch = facts.snapshot.branches.find((branch) => branch.name === member.targetBranch)!
    const sourceBranches = facts.snapshot.branches
      .filter((branch) => branch.name !== member.targetBranch)
      .map(
        (branch): BranchWorkspaceBatchMergeInSourcePlan => ({
          branch: branch.name,
          head: branch.worktree?.head ?? branch.lastCommitHash,
        }),
      )
    const ready = targetEntries.length === 0 && sourceBranches.length > 0
    const message =
      targetEntries.length > 0
        ? 'workspace.branch-workspace.git-action.target-worktree-dirty'
        : sourceBranches.length === 0
          ? 'workspace.branch-workspace.git-action.source-branch-required'
          : undefined
    members.push({
      repositoryName: member.repositoryName,
      repoId: facts.repoId,
      targetBranch: member.targetBranch,
      targetWorktreePath: member.worktreePath,
      targetHead: facts.head,
      ready,
      pullMergePushReady: Boolean(targetBranch.tracking && !targetBranch.trackingGone),
      ...(message ? { message } : {}),
      sourceBranches,
      fingerprint: fingerprint({
        targetHead: facts.head,
        targetStatus: targetEntries,
        sourceBranches,
      }),
    })
  }
  const planWithoutToken = {
    kind: 'batch-merge-in' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: fingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildBatchMergeOutPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const members: BranchWorkspaceBatchMergeOutMemberPlan[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      signal,
    )
    if (!facts.ok) return facts
    const targetEntries = normalizedEntries(facts.status.entries)
    const destinationBranches = facts.snapshot.branches
      .filter((branch) => branch.name !== member.targetBranch)
      .map((branch): BranchWorkspaceBatchMergeOutDestinationPlan => {
        const worktreePath = branch.worktree?.path
        const destinationStatus = worktreePath ? findStatus(facts.repoId, facts.statuses, worktreePath) : undefined
        const ownedTemporaryWorktree = Boolean(
          worktreePath && isBranchWorkspaceBatchMergeTemporaryWorktreePath(facts.repoId, worktreePath),
        )
        const unavailable = Boolean(worktreePath && !destinationStatus && !ownedTemporaryWorktree)
        const dirty = Boolean(destinationStatus && destinationStatus.entries.length > 0 && !ownedTemporaryWorktree)
        const lockedTemporaryWorktree = ownedTemporaryWorktree && branch.worktree?.isLocked === true
        const ready = !unavailable && !dirty && !lockedTemporaryWorktree
        const message = dirty
          ? 'workspace.branch-workspace.git-action.destination-worktree-dirty'
          : unavailable || lockedTemporaryWorktree
            ? 'workspace.branch-workspace.git-action.destination-worktree-unavailable'
            : undefined
        return {
          branch: branch.name,
          head: branch.worktree?.head ?? destinationStatus?.head ?? branch.lastCommitHash,
          ready,
          ...(worktreePath ? { worktreePath } : {}),
          requiresTemporaryWorktree: !worktreePath || ownedTemporaryWorktree,
          pullMergePushReady: Boolean(branch.tracking && !branch.trackingGone),
          ...(message ? { message } : {}),
        }
      })
    const ready = targetEntries.length === 0 && destinationBranches.some((branch) => branch.ready)
    const message =
      targetEntries.length > 0
        ? 'workspace.branch-workspace.git-action.target-worktree-dirty'
        : destinationBranches.length === 0
          ? 'workspace.branch-workspace.git-action.destination-branch-required'
          : destinationBranches.some((branch) => branch.ready)
            ? undefined
            : 'workspace.branch-workspace.git-action.destination-worktree-unavailable'
    members.push({
      repositoryName: member.repositoryName,
      repoId: facts.repoId,
      targetBranch: member.targetBranch,
      targetWorktreePath: member.worktreePath,
      targetHead: facts.head,
      ready,
      ...(message ? { message } : {}),
      destinationBranches,
      fingerprint: fingerprint({
        targetHead: facts.head,
        targetStatus: targetEntries,
        destinationBranches: destinationBranches.map((branch) => branch.branch),
      }),
    })
  }
  const planWithoutToken = {
    kind: 'batch-merge-out' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: fingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildSyncPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  kind: 'pull' | 'push',
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const members: BranchWorkspaceSyncMemberPlan[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      signal,
    )
    if (!facts.ok) return facts
    const branch = facts.snapshot.branches.find((candidate) => candidate.name === member.targetBranch)!
    const ready =
      kind === 'pull' ? Boolean(branch.tracking && !branch.trackingGone) : facts.snapshot.remote?.hasRemotes === true
    const message = ready
      ? undefined
      : kind === 'pull'
        ? 'workspace.branch-workspace.git-action.target-upstream-required'
        : 'workspace.branch-workspace.git-action.remote-required'
    const remotes = (facts.snapshot.remote?.remotes ?? [])
      .map((remote) => ({ name: remote.name, pushUrl: remote.pushUrl }))
      .sort((left, right) => left.name.localeCompare(right.name))
    members.push({
      repositoryName: member.repositoryName,
      repoId: facts.repoId,
      targetBranch: member.targetBranch,
      targetWorktreePath: member.worktreePath,
      targetHead: facts.head,
      ready,
      ...(message ? { message } : {}),
      fingerprint: fingerprint({
        kind,
        head: facts.head,
        status: normalizedEntries(facts.status.entries),
        upstream: branch.tracking ?? null,
        trackingGone: branch.trackingGone === true,
        remotes,
      }),
    })
  }
  const planWithoutToken = {
    kind,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
    ready: members.every((member) => member.ready),
  }
  return { ok: true, plan: { token: fingerprint(planWithoutToken), ...planWithoutToken } }
}

async function readMemberFacts(
  rootId: string,
  repositoryName: string,
  targetBranch: string,
  targetWorktreePath: string,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<
  | {
      ok: true
      repoId: string
      snapshot: RepoSnapshot
      statuses: WorktreeStatus[]
      status: WorktreeStatus
      head: string
    }
  | { ok: false; message: string; repositoryName: string }
> {
  const repoId = workspaceRepositoryId(rootId, repositoryName)
  if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable', repositoryName }
  const [snapshot, statuses] = await Promise.all([
    (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal),
    (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal),
  ])
  if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable', repositoryName }
  const branch = snapshot.branches.find((candidate) => candidate.name === targetBranch)
  if (!branch?.worktree || normalizePath(repoId, branch.worktree.path) !== normalizePath(repoId, targetWorktreePath)) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.target-worktree-required', repositoryName }
  }
  const status = findStatus(repoId, statuses, targetWorktreePath)
  if (!status)
    return { ok: false, message: 'workspace.branch-workspace.git-action.target-worktree-unavailable', repositoryName }
  return {
    ok: true,
    repoId,
    snapshot,
    statuses,
    status,
    head: branch.worktree.head ?? status.head ?? branch.lastCommitHash,
  }
}

function findStatus(repoId: string, statuses: WorktreeStatus[], worktreePath: string): WorktreeStatus | undefined {
  const expected = normalizePath(repoId, worktreePath)
  return statuses.find((status) => normalizePath(repoId, status.path) === expected)
}

function normalizePath(repoId: string, value: string): string {
  return isRemoteRepoId(repoId) ? path.posix.normalize(value) : path.resolve(value)
}

function normalizedEntries(entries: StatusEntry[]): StatusEntry[] {
  return entries
    .map((entry) => ({
      x: entry.x,
      y: entry.y,
      path: entry.path,
      ...(entry.originalPath ? { originalPath: entry.originalPath } : {}),
    }))
    .sort((a, b) =>
      `${a.path}\0${a.originalPath ?? ''}\0${a.x}${a.y}`.localeCompare(
        `${b.path}\0${b.originalPath ?? ''}\0${b.x}${b.y}`,
      ),
    )
}

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && error.message) return error.message
  return 'workspace.branch-workspace.git-action.read-failed'
}
