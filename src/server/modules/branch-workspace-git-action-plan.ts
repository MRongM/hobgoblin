import { isBranchWorkspaceBatchMergeTemporaryWorktreePath } from '#/server/modules/branch-workspace-batch-merge-worktree.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import {
  findRepositoryStatus,
  normalizeRepositoryPath,
  normalizedStatusEntries,
  repositoryPlanFingerprint,
} from '#/server/modules/repository-status-plan.ts'
import { workspaceRepositoryId, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  getRepositoryPatch,
  getRepositoryRemoteBranchInfo,
  getRepositorySnapshot,
  getRepositoryStatus,
} from '#/server/modules/repo-read-paths.ts'
import {
  normalizeBranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceBatchCommitMemberPlan,
  type BranchWorkspaceBatchDiscardMemberPlan,
  type BranchWorkspaceBatchMergeInMemberPlan,
  type BranchWorkspaceBatchMergeInSourcePlan,
  type BranchWorkspaceBatchMergeOutDestinationPlan,
  type BranchWorkspaceBatchMergeOutMemberPlan,
  type BranchWorkspaceBatchSetUpstreamMemberPlan,
  type BranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceGitActionPlanResult,
  type BranchWorkspaceSyncMemberPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import type { ExecResult, WorktreeStatus } from '#/shared/git-types.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import { parseRemoteBranchRef, type RemoteTrackingBranchInfo } from '#/shared/remote-branches.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import { isSafeRemoteName } from '#/shared/worktree-create.ts'

export interface BranchWorkspaceGitActionPlanDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  getSnapshot?: typeof getRepositorySnapshot
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
  getPatch?: (repoId: string, worktreePath: string, signal?: AbortSignal) => Promise<ExecResult>
  getRemoteBranchInfo?: (repoId: string, signal?: AbortSignal) => Promise<RemoteTrackingBranchInfo[]>
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
    if (normalized.request.kind === 'batch-discard') {
      return await buildBatchDiscardPlan(normalizedRootId, manifest, dependencies, signal)
    }
    if (normalized.request.kind === 'batch-merge-in') {
      return await buildBatchMergeInPlan(normalizedRootId, manifest, dependencies, signal)
    }
    if (normalized.request.kind === 'batch-merge-out') {
      return await buildBatchMergeOutPlan(normalizedRootId, manifest, dependencies, signal)
    }
    if (normalized.request.kind === 'batch-set-upstream') {
      return await buildBatchSetUpstreamPlan(normalizedRootId, manifest, dependencies, signal)
    }
    return await buildSyncPlan(normalizedRootId, manifest, normalized.request.kind, dependencies, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
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

  if (current.plan.kind !== expected.kind) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' }
  }
  const currentMembers = new Map(current.plan.members.map((member) => [member.repositoryName, member]))
  for (const member of expected.members) {
    if (completedRepositoryNames.has(member.repositoryName)) continue
    if (currentMembers.get(member.repositoryName)?.fingerprint !== member.fingerprint) {
      return {
        ok: false as const,
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
  const memberPlans = await Promise.all(
    manifest.repositories.map(async (member) => {
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
          ok: false as const,
          message: patch.message || 'workspace.branch-workspace.git-action.read-failed',
          repositoryName: member.repositoryName,
        }
      }
      const entries = normalizedStatusEntries(facts.status.entries)
      return {
        ok: true as const,
        member: {
          repositoryName: member.repositoryName,
          repoId: facts.repoId,
          targetBranch: member.targetBranch,
          targetWorktreePath: member.worktreePath,
          dirty: entries.length > 0,
          changeCount: entries.length,
          fingerprint: repositoryPlanFingerprint({ head: facts.head, status: entries, patch: patch.message }),
        },
      }
    }),
  )
  const members: BranchWorkspaceBatchCommitMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
  }
  const planWithoutToken = {
    kind: 'batch-commit' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildBatchDiscardPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const memberPlans = await Promise.all(
    manifest.repositories.map(async (member) => {
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
          ok: false as const,
          message: patch.message || 'workspace.branch-workspace.git-action.read-failed',
          repositoryName: member.repositoryName,
        }
      }
      const entries = normalizedStatusEntries(facts.status.entries)
      return {
        ok: true as const,
        member: {
          repositoryName: member.repositoryName,
          repoId: facts.repoId,
          targetBranch: member.targetBranch,
          targetWorktreePath: member.worktreePath,
          paths: entries.map((entry) => entry.path),
          changeCount: entries.length,
          fingerprint: repositoryPlanFingerprint({ head: facts.head, status: entries, patch: patch.message }),
        },
      }
    }),
  )
  const members: BranchWorkspaceBatchDiscardMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
  }
  const planWithoutToken = {
    kind: 'batch-discard' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
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
      true,
    )
    if (!facts.ok) return facts
    const targetEntries = normalizedStatusEntries(facts.status.entries)
    const targetBranch = facts.snapshot.branches.find((branch) => branch.name === member.targetBranch)!
    const sourceBranches = facts.snapshot.branches
      .filter((branch) => branch.name !== member.targetBranch)
      .map(
        (branch): BranchWorkspaceBatchMergeInSourcePlan => ({
          source: { kind: 'local', branch: branch.name },
          head: branch.worktree?.head ?? branch.lastCommitHash,
        }),
      )
      .concat(
        [...facts.remoteBranches]
          .sort((left, right) => left.remoteRef.localeCompare(right.remoteRef))
          .map((branch) => ({
            source: { kind: 'remote' as const, remoteRef: branch.remoteRef },
            head: branch.head,
          })),
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
      fingerprint: repositoryPlanFingerprint({
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
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
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
      true,
    )
    if (!facts.ok) return facts
    const targetEntries = normalizedStatusEntries(facts.status.entries)
    const sourceConflicted = hasUnmergedStatusEntries(targetEntries)
    const destinationBranches = facts.snapshot.branches
      .filter((branch) => branch.name !== member.targetBranch)
      .map((branch): BranchWorkspaceBatchMergeOutDestinationPlan => {
        const worktreePath = branch.worktree?.path
        const destinationStatus = worktreePath
          ? findRepositoryStatus(facts.repoId, facts.statuses, worktreePath)
          : undefined
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
          destination: { kind: 'local', branch: branch.name },
          head: branch.worktree?.head ?? destinationStatus?.head ?? branch.lastCommitHash,
          ready,
          ...(worktreePath ? { worktreePath } : {}),
          requiresTemporaryWorktree: !worktreePath || ownedTemporaryWorktree,
          pullMergePushReady: Boolean(branch.tracking && !branch.trackingGone),
          ...(message ? { message } : {}),
        }
      })
      .concat(
        [...facts.remoteBranches]
          .sort((left, right) => left.remoteRef.localeCompare(right.remoteRef))
          .map(
            (branch): BranchWorkspaceBatchMergeOutDestinationPlan => ({
              destination: { kind: 'remote', remoteRef: branch.remoteRef },
              head: branch.head,
              ready: true,
              requiresTemporaryWorktree: true,
              pullMergePushReady: true,
            }),
          ),
      )
    const ready = !sourceConflicted && destinationBranches.some((branch) => branch.ready)
    const message = sourceConflicted
      ? 'workspace.branch-workspace.git-action.source-worktree-conflicted'
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
      fingerprint: repositoryPlanFingerprint({
        targetHead: facts.head,
        sourceConflicted,
        destinationBranches,
      }),
    })
  }
  const planWithoutToken = {
    kind: 'batch-merge-out' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
  }
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
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
    const pushRemotes =
      kind === 'push'
        ? (facts.snapshot.remote?.remotes ?? [])
            .map((remote) => remote.name)
            .filter(isSafeRemoteName)
            .sort((left, right) => left.localeCompare(right))
        : []
    const upstreamRemote = branch.tracking ? parseRemoteBranchRef(branch.tracking)?.remote : undefined
    const requiresUpstreamCreation = kind === 'push' && (!upstreamRemote || !pushRemotes.includes(upstreamRemote))
    const ready = kind === 'pull' ? Boolean(branch.tracking && !branch.trackingGone) : pushRemotes.length > 0
    const message = ready
      ? undefined
      : kind === 'pull'
        ? 'workspace.branch-workspace.git-action.target-upstream-required'
        : 'workspace.branch-workspace.git-action.remote-required'
    members.push({
      repositoryName: member.repositoryName,
      repoId: facts.repoId,
      targetBranch: member.targetBranch,
      targetWorktreePath: member.worktreePath,
      targetHead: facts.head,
      upstream: branch.tracking ?? null,
      trackingGone: branch.trackingGone === true,
      requiresUpstreamCreation,
      pushRemotes,
      ready,
      ...(message ? { message } : {}),
      fingerprint: repositoryPlanFingerprint({
        kind,
        head: facts.head,
        status: normalizedStatusEntries(facts.status.entries),
        upstream: branch.tracking ?? null,
        trackingGone: branch.trackingGone === true,
        pushRemotes,
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
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildBatchSetUpstreamPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const members: BranchWorkspaceBatchSetUpstreamMemberPlan[] = []
  for (const member of manifest.repositories) {
    signal?.throwIfAborted()
    try {
      const facts = await readMemberFacts(
        rootId,
        member.repositoryName,
        member.targetBranch,
        member.worktreePath,
        dependencies,
        signal,
        true,
      )
      if (!facts.ok) {
        members.push(unreadableBatchSetUpstreamMember(rootId, member, facts.message))
        continue
      }
      const branch = facts.snapshot.branches.find((candidate) => candidate.name === member.targetBranch)!
      const remoteBranches = [...facts.remoteBranches].sort((left, right) =>
        left.remoteRef.localeCompare(right.remoteRef),
      )
      const ready = remoteBranches.length > 0 || branch.tracking != null
      const message = ready ? undefined : 'workspace.branch-workspace.git-action.remote-branch-required'
      members.push({
        repositoryName: member.repositoryName,
        repoId: facts.repoId,
        targetBranch: member.targetBranch,
        targetWorktreePath: member.worktreePath,
        targetHead: facts.head,
        currentUpstream: branch.tracking ?? null,
        trackingGone: branch.trackingGone === true,
        remoteBranches,
        ready,
        ...(message ? { message } : {}),
        fingerprint: repositoryPlanFingerprint({
          repositoryName: member.repositoryName,
          repoId: facts.repoId,
          targetBranch: member.targetBranch,
          targetWorktreePath: member.worktreePath,
          targetHead: facts.head,
          currentUpstream: branch.tracking ?? null,
          trackingGone: branch.trackingGone === true,
          remoteBranches: remoteBranches.map(({ remoteRef, head }) => ({ remoteRef, head })),
        }),
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      members.push(unreadableBatchSetUpstreamMember(rootId, member, safeMessage(error)))
    }
  }
  const planWithoutToken = {
    kind: 'batch-set-upstream' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
    ready: members.every((member) => member.ready),
  }
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
}

function unreadableBatchSetUpstreamMember(
  rootId: string,
  member: BranchWorkspaceManifest['repositories'][number],
  message: string,
): BranchWorkspaceBatchSetUpstreamMemberPlan {
  const repoId = workspaceRepositoryId(rootId, member.repositoryName) ?? member.repositoryName
  const identity = {
    repositoryName: member.repositoryName,
    repoId,
    targetBranch: member.targetBranch,
    targetWorktreePath: member.worktreePath,
  }
  return {
    ...identity,
    targetHead: '',
    currentUpstream: null,
    trackingGone: false,
    remoteBranches: [],
    ready: false,
    message,
    fingerprint: repositoryPlanFingerprint({ ...identity, readFailure: message }),
  }
}

async function readMemberFacts(
  rootId: string,
  repositoryName: string,
  targetBranch: string,
  targetWorktreePath: string,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
  includeRemoteBranches = false,
): Promise<
  | {
      ok: true
      repoId: string
      snapshot: RepoSnapshot
      statuses: WorktreeStatus[]
      status: WorktreeStatus
      head: string
      remoteBranches: RemoteTrackingBranchInfo[]
    }
  | { ok: false; message: string; repositoryName: string }
> {
  const repoId = workspaceRepositoryId(rootId, repositoryName)
  if (!repoId) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable', repositoryName }
  const [snapshot, statuses, remoteBranchesResult] = await Promise.all([
    (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, { includeWorktreeStatus: false }),
    (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal),
    includeRemoteBranches
      ? readRemoteBranches(repoId, dependencies.getRemoteBranchInfo ?? getRepositoryRemoteBranchInfo, signal)
      : Promise.resolve({ ok: true as const, branches: [] }),
  ])
  if (!remoteBranchesResult.ok) {
    return {
      ok: false,
      message: 'workspace.branch-workspace.git-action.remote-branches-unavailable',
      repositoryName,
    }
  }
  if (!snapshot) return { ok: false, message: 'workspace.branch-workspace.repository-unavailable', repositoryName }
  const branch = snapshot.branches.find((candidate) => candidate.name === targetBranch)
  if (
    !branch?.worktree ||
    normalizeRepositoryPath(repoId, branch.worktree.path) !== normalizeRepositoryPath(repoId, targetWorktreePath)
  ) {
    return { ok: false, message: 'workspace.branch-workspace.git-action.target-worktree-required', repositoryName }
  }
  const status = findRepositoryStatus(repoId, statuses, targetWorktreePath)
  if (!status)
    return { ok: false, message: 'workspace.branch-workspace.git-action.target-worktree-unavailable', repositoryName }
  return {
    ok: true,
    repoId,
    snapshot,
    statuses,
    status,
    head: branch.worktree.head ?? status.head ?? branch.lastCommitHash,
    remoteBranches: remoteBranchesResult.branches,
  }
}

async function readRemoteBranches(
  repoId: string,
  reader: (repoId: string, signal?: AbortSignal) => Promise<RemoteTrackingBranchInfo[]>,
  signal?: AbortSignal,
): Promise<{ ok: true; branches: RemoteTrackingBranchInfo[] } | { ok: false }> {
  try {
    return { ok: true, branches: await reader(repoId, signal) }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return { ok: false }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  if (error instanceof Error && error.message) return error.message
  return 'workspace.branch-workspace.git-action.read-failed'
}
