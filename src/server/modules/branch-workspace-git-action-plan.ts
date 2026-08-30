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
  getRepositoryWorktreeStatusEntries,
} from '#/server/modules/repo-read-paths.ts'
import {
  normalizeBranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceBatchCommitMemberPlan,
  type BranchWorkspaceBatchAlignRemoteMemberPlan,
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
import type { ExecResult, StatusEntry, WorktreeContentState, WorktreeStatus } from '#/shared/git-types.ts'
import { statusEntryPaths } from '#/shared/git-status.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import { parseRemoteBranchRef, type RemoteTrackingBranchInfo } from '#/shared/remote-branches.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import { isSafeRemoteName } from '#/shared/worktree-create.ts'

export interface BranchWorkspaceGitActionPlanDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  getSnapshot?: typeof getRepositorySnapshot
  getStatus?: (repoId: string, signal?: AbortSignal) => Promise<WorktreeStatus[]>
  getWorktreeStatusEntries?: (
    repoId: string,
    worktreePath: string,
    signal?: AbortSignal,
  ) => Promise<StatusEntry[] | null>
  getWorktreeContentState?: (
    repoId: string,
    worktreePath: string,
    signal?: AbortSignal,
  ) => Promise<WorktreeContentState | null>
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
    if (normalized.request.kind === 'batch-align-remote') {
      return await buildBatchAlignRemotePlan(normalizedRootId, manifest, dependencies, signal)
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
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    memberSignal.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
    )
    if (!facts.ok) return facts
    const patch = await (dependencies.getPatch ?? getRepositoryPatch)(facts.repoId, member.worktreePath, memberSignal)
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
  })
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
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    memberSignal.throwIfAborted()
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
    )
    if (!facts.ok) return facts
    const patch = await (dependencies.getPatch ?? getRepositoryPatch)(facts.repoId, member.worktreePath, memberSignal)
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
        paths: statusEntryPaths(entries),
        changeCount: entries.length,
        fingerprint: repositoryPlanFingerprint({ head: facts.head, status: entries, patch: patch.message }),
      },
    }
  })
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

async function buildBatchAlignRemotePlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
    )
    if (!facts.ok) return facts
    const branch = facts.snapshot.branches.find((candidate) => candidate.name === member.targetBranch)!
    const entries = normalizedStatusEntries(facts.status.entries)
    const upstream = branch.tracking ?? null
    const ready = Boolean(upstream && !branch.trackingGone && parseRemoteBranchRef(upstream))
    const message = ready ? undefined : 'workspace.branch-workspace.git-action.target-upstream-required'
    return {
      ok: true as const,
      member: {
        repositoryName: member.repositoryName,
        repoId: facts.repoId,
        targetBranch: member.targetBranch,
        targetWorktreePath: member.worktreePath,
        targetHead: facts.head,
        upstream,
        ahead: branch.ahead,
        changeCount: entries.length,
        ready,
        ...(message ? { message } : {}),
        fingerprint: repositoryPlanFingerprint({
          repositoryName: member.repositoryName,
          repoId: facts.repoId,
          targetBranch: member.targetBranch,
          targetWorktreePath: member.worktreePath,
          upstream,
          ready,
        }),
      },
    }
  })
  const members: BranchWorkspaceBatchAlignRemoteMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
  }
  const planWithoutToken = {
    kind: 'batch-align-remote' as const,
    rootId,
    branchWorkspaceId: manifest.id,
    members,
    ready: members.every((member) => member.ready),
  }
  return { ok: true, plan: { token: repositoryPlanFingerprint(planWithoutToken), ...planWithoutToken } }
}

async function buildBatchMergeInPlan(
  rootId: string,
  manifest: BranchWorkspaceManifest,
  dependencies: BranchWorkspaceGitActionPlanDependencies,
  signal?: AbortSignal,
): Promise<BranchWorkspaceGitActionPlanResult> {
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
      { includeRemoteBranches: true },
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
    return {
      ok: true as const,
      member: {
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
      },
    }
  })
  const members: BranchWorkspaceBatchMergeInMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
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
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
      { includeRemoteBranches: true, includeAllWorktreeStatuses: true },
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
    return {
      ok: true as const,
      member: {
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
      },
    }
  })
  const members: BranchWorkspaceBatchMergeOutMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
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
  const memberPlans = await mapPlanMembers(manifest, signal, async (member, memberSignal) => {
    const facts = await readMemberFacts(
      rootId,
      member.repositoryName,
      member.targetBranch,
      member.worktreePath,
      dependencies,
      memberSignal,
      { includeRemoteMetadata: kind === 'push' },
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
    return {
      ok: true as const,
      member: {
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
      },
    }
  })
  const members: BranchWorkspaceSyncMemberPlan[] = []
  for (const memberPlan of memberPlans) {
    if (!memberPlan.ok) return memberPlan
    members.push(memberPlan.member)
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
  const members = await mapPlanMembers<BranchWorkspaceBatchSetUpstreamMemberPlan>(
    manifest,
    signal,
    async (member, memberSignal) => {
      try {
        const facts = await readMemberFacts(
          rootId,
          member.repositoryName,
          member.targetBranch,
          member.worktreePath,
          dependencies,
          memberSignal,
          { includeRemoteBranches: true },
        )
        if (!facts.ok) return unreadableBatchSetUpstreamMember(rootId, member, facts.message)
        const branch = facts.snapshot.branches.find((candidate) => candidate.name === member.targetBranch)!
        const remoteBranches = [...facts.remoteBranches].sort((left, right) =>
          left.remoteRef.localeCompare(right.remoteRef),
        )
        const ready = remoteBranches.length > 0 || branch.tracking != null
        const message = ready ? undefined : 'workspace.branch-workspace.git-action.remote-branch-required'
        return {
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
        }
      } catch (error) {
        if (isAbortError(error)) throw error
        return unreadableBatchSetUpstreamMember(rootId, member, safeMessage(error))
      }
    },
  )
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
  options: {
    includeRemoteBranches?: boolean
    includeAllWorktreeStatuses?: boolean
    includeRemoteMetadata?: boolean
  } = {},
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
  const targetStatusReader =
    dependencies.getWorktreeStatusEntries ?? (dependencies.getStatus ? undefined : getRepositoryWorktreeStatusEntries)
  const [snapshot, statuses, remoteBranchesResult] = await Promise.all([
    (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId, signal, {
      includeWorktreeStatus: false,
      ...(options.includeRemoteMetadata ? {} : { includeRemote: false }),
    }),
    options.includeAllWorktreeStatuses || !targetStatusReader
      ? (dependencies.getStatus ?? getRepositoryStatus)(repoId, signal)
      : targetStatusReader(repoId, targetWorktreePath, signal).then((entries) =>
          entries ? [{ path: targetWorktreePath, branch: targetBranch, head: '', isMain: false, entries }] : [],
        ),
    options.includeRemoteBranches
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

const PLAN_MEMBER_READ_CONCURRENCY = 4

async function mapPlanMembers<T>(
  manifest: BranchWorkspaceManifest,
  signal: AbortSignal | undefined,
  reader: (member: BranchWorkspaceManifest['repositories'][number], signal: AbortSignal) => Promise<T>,
): Promise<T[]> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })
  const results = new Array<T>(manifest.repositories.length)
  let nextIndex = 0
  let firstError: unknown
  let failed = false

  const worker = async () => {
    while (!failed && !controller.signal.aborted) {
      const index = nextIndex
      if (index >= manifest.repositories.length) return
      nextIndex += 1
      try {
        results[index] = await reader(manifest.repositories[index]!, controller.signal)
      } catch (error) {
        if (!failed) {
          failed = true
          firstError = error
          controller.abort(error)
        }
        return
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(PLAN_MEMBER_READ_CONCURRENCY, manifest.repositories.length) }, worker),
    )
  } finally {
    signal?.removeEventListener('abort', forwardAbort)
  }
  if (failed) throw firstError
  signal?.throwIfAborted()
  return results
}
