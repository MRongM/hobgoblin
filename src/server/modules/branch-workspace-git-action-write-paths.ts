import pLimit from 'p-limit'
import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanDependencies,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import { branchWorkspaceBatchMergeTemporaryWorktreePath } from '#/server/modules/branch-workspace-batch-merge-worktree.ts'
import { publishBranchWorkspaceOperationUpdate } from '#/server/modules/invalidation-broker.ts'
import {
  alignRepositoryWorktreeToRemote,
  commitRepositoryChanges,
  createRepositoryWorktree,
  discardRepositoryChanges,
  fetchRepositoryRemote,
  mergeRepositoryBranch,
  publishRepositorySnapshotInvalidation,
  pullRepositoryBranch,
  pushRepositoryBranch,
  pushRepositoryWorktreeHeadToRemoteBranch,
  removeRepositoryWorktree,
  setRepositoryBranchUpstream,
} from '#/server/modules/repo-write-paths.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceBatchPushTargetInput,
  type BranchWorkspaceBatchMergeInMemberPlan,
  type BranchWorkspaceBatchMergeInSourceInput,
  type BranchWorkspaceBatchMergeInSourcePlan,
  type BranchWorkspaceBatchMergeOutDestinationPlan,
  type BranchWorkspaceBatchMergeOutMemberPlan,
  type BranchWorkspaceBatchMergeOutTargetInput,
  type BranchWorkspaceBatchSetUpstreamInput,
  type BranchWorkspaceBatchSetUpstreamMemberPlan,
  type BranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceGitActionMemberResult,
  type BranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceGitActionPlanResult,
  type BranchWorkspaceGitActionResult,
  type BranchWorkspaceMergeMode,
  type BranchWorkspaceSyncMemberPlan,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import type { ExecResult, GitConflictWorktree } from '#/shared/git-types.ts'
import { parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import {
  repositoryMergeBranchFullRef,
  repositoryMergeBranchSelectionKey,
  type RepositoryMergeBranchSelection,
} from '#/shared/repository-merge-branch.ts'

interface PendingAction {
  plan: BranchWorkspaceGitActionPlan
  completed: Set<string>
  requiresReplan?: boolean
  mergeProgress: Map<string, 'pulled' | 'fetched' | 'verified' | 'merged' | 'pushed'>
  mergeTemporaryWorktrees: Map<string, string>
  mergeExecution?:
    | {
        kind: 'batch-merge-in'
        mode: BranchWorkspaceMergeMode
        sources: BranchWorkspaceBatchMergeInSourceInput[]
      }
    | {
        kind: 'batch-merge-out'
        mode: BranchWorkspaceMergeMode
        targets: BranchWorkspaceBatchMergeOutTargetInput[]
      }
  upstreamExecution?: {
    kind: 'batch-set-upstream'
    upstreams: BranchWorkspaceBatchSetUpstreamInput[]
  }
  pushExecution?: {
    kind: 'push'
    targets: BranchWorkspaceBatchPushTargetInput[]
  }
}

type BranchWorkspaceBatchMergeInExecutionMember = BranchWorkspaceBatchMergeInMemberPlan & {
  source: BranchWorkspaceBatchMergeInSourcePlan
}

type BranchWorkspaceBatchMergeOutExecutionMember = BranchWorkspaceBatchMergeOutMemberPlan & {
  destination: BranchWorkspaceBatchMergeOutDestinationPlan
}

type BranchWorkspaceBatchSetUpstreamExecutionMember = BranchWorkspaceBatchSetUpstreamMemberPlan &
  BranchWorkspaceBatchSetUpstreamInput

type BranchWorkspaceBatchPushExecutionMember = BranchWorkspaceSyncMemberPlan & BranchWorkspaceBatchPushTargetInput

interface ActiveAction {
  branchWorkspaceId: string
  controller: AbortController
  snapshot: BranchWorkspaceActiveOperation
  startedRepositoryNames: Set<string>
  memberOrder: Map<string, number>
}

interface ActionExecutionContext {
  rootId: string
  active: Map<string, ActiveAction>
  touchedRepoIds: Set<string>
  publishOperationUpdate: typeof publishBranchWorkspaceOperationUpdate
}

type BranchWorkspaceGitActionMemberFailures = Map<string, BranchWorkspaceGitActionMemberResult>

const DEFER_REPOSITORY_INVALIDATION = { publishInvalidation: false } as const
const BRANCH_WORKSPACE_BATCH_GIT_CONCURRENCY = 4

type SetRepositoryBranchUpstream = typeof setRepositoryBranchUpstream

export interface BranchWorkspaceGitActionWriteDependencies {
  planDependencies?: BranchWorkspaceGitActionPlanDependencies
  buildPlan?: typeof buildBranchWorkspaceGitActionPlan
  validatePlan?: typeof validateBranchWorkspaceGitActionPlan
  commit?: typeof commitRepositoryChanges
  discard?: typeof discardRepositoryChanges
  alignRemote?: typeof alignRepositoryWorktreeToRemote
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
  fetchRemote?: typeof fetchRepositoryRemote
  pushWorktreeHead?: typeof pushRepositoryWorktreeHeadToRemoteBranch
  setUpstream?: SetRepositoryBranchUpstream
  publishOperationUpdate?: typeof publishBranchWorkspaceOperationUpdate
  publishRepoInvalidation?: typeof publishRepositorySnapshotInvalidation
}

export interface BranchWorkspaceGitActionWriteService {
  plan(
    rootId: string,
    request: BranchWorkspaceGitActionPlanRequest,
    signal?: AbortSignal,
  ): Promise<BranchWorkspaceGitActionPlanResult>
  execute(
    rootId: string,
    input: BranchWorkspaceGitActionExecuteInput,
  ): Promise<BranchWorkspaceGitActionResult | { ok: false; message: string }>
  abort(rootId: string): boolean
  activeOperation(rootId: string, branchWorkspaceId: string): BranchWorkspaceActiveOperation | null
}

export function createBranchWorkspaceGitActionWriteService(
  dependencies: BranchWorkspaceGitActionWriteDependencies = {},
): BranchWorkspaceGitActionWriteService {
  const pending = new Map<string, PendingAction>()
  const active = new Map<string, ActiveAction>()
  const buildPlan = dependencies.buildPlan ?? buildBranchWorkspaceGitActionPlan
  const validatePlan = dependencies.validatePlan ?? validateBranchWorkspaceGitActionPlan
  const commit = dependencies.commit ?? commitRepositoryChanges
  const discard = dependencies.discard ?? discardRepositoryChanges
  const alignRemote = dependencies.alignRemote ?? alignRepositoryWorktreeToRemote
  const pull = dependencies.pull ?? pullRepositoryBranch
  const merge = dependencies.merge ?? mergeRepositoryBranch
  const push = dependencies.push ?? pushRepositoryBranch
  const createWorktree = dependencies.createWorktree ?? createRepositoryWorktree
  const removeWorktree = dependencies.removeWorktree ?? removeRepositoryWorktree
  const fetchRemote = dependencies.fetchRemote ?? fetchRepositoryRemote
  const pushWorktreeHead = dependencies.pushWorktreeHead ?? pushRepositoryWorktreeHeadToRemoteBranch
  const setUpstream: SetRepositoryBranchUpstream = dependencies.setUpstream ?? setRepositoryBranchUpstream
  const publishOperationUpdate = dependencies.publishOperationUpdate ?? publishBranchWorkspaceOperationUpdate
  const publishRepoInvalidation = dependencies.publishRepoInvalidation ?? publishRepositorySnapshotInvalidation

  return {
    async plan(rootId, request, signal) {
      const normalizedRootId = workspaceRootId(rootId)
      if (active.has(normalizedRootId)) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.operation-active' }
      }
      const result = await buildPlan(normalizedRootId, request, dependencies.planDependencies, signal)
      if (result.ok) {
        pending.set(normalizedRootId, {
          plan: result.plan,
          completed: new Set(),
          mergeProgress: new Map(),
          mergeTemporaryWorktrees: new Map(),
        })
      }
      return result
    },

    async execute(rootId, rawInput) {
      const normalizedRootId = workspaceRootId(rootId)
      const normalized = normalizeBranchWorkspaceGitActionExecuteInput(rawInput)
      if (!normalized.ok) return normalized
      const input = normalized.input
      const state = pending.get(normalizedRootId)
      if (!state || state.plan.token !== input.planToken || state.plan.kind !== input.kind) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.plan-expired' }
      }
      if (state.requiresReplan) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.plan-expired' }
      }
      if (active.has(normalizedRootId)) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.operation-active' }
      }
      if (input.kind === 'batch-commit' && !validBatchMessages(state.plan, input)) {
        return { ok: false, message: 'error.invalid-arguments' }
      }
      if (input.kind === 'batch-align-remote' && state.plan.kind === input.kind && !state.plan.ready) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.target-upstream-required' }
      }
      const mergeInSelection =
        input.kind === 'batch-merge-in' ? selectedBatchMergeInMembers(state.plan, input.sources) : null
      if (input.kind === 'batch-merge-in' && (!mergeInSelection || !mergeInSelection.ok)) {
        return { ok: false, message: mergeInSelection?.message ?? 'error.invalid-arguments' }
      }
      const mergeOutSelection =
        input.kind === 'batch-merge-out' ? selectedBatchMergeOutMembers(state.plan, input.targets) : null
      if (input.kind === 'batch-merge-out' && (!mergeOutSelection || !mergeOutSelection.ok)) {
        return { ok: false, message: mergeOutSelection?.message ?? 'error.invalid-arguments' }
      }
      const pullSelection = input.kind === 'pull' ? selectedSyncMembers(state.plan, input.repositoryNames) : null
      if (input.kind === 'pull' && (!pullSelection || !pullSelection.ok)) {
        return { ok: false, message: pullSelection?.message ?? 'error.invalid-arguments' }
      }
      const pushSelection = input.kind === 'push' ? selectedBatchPushMembers(state.plan, input.targets) : null
      if (input.kind === 'push' && (!pushSelection || !pushSelection.ok)) {
        return { ok: false, message: pushSelection?.message ?? 'error.invalid-arguments' }
      }
      const upstreamSelection =
        input.kind === 'batch-set-upstream' ? selectedBatchSetUpstreamMembers(state.plan, input.upstreams) : null
      if (input.kind === 'batch-set-upstream' && (!upstreamSelection || !upstreamSelection.ok)) {
        return { ok: false, message: upstreamSelection?.message ?? 'error.invalid-arguments' }
      }
      const mergeInMembers = mergeInSelection?.ok ? mergeInSelection.members : null
      const mergeOutMembers = mergeOutSelection?.ok ? mergeOutSelection.members : null
      const syncMembers = pullSelection?.ok ? pullSelection.members : pushSelection?.ok ? pushSelection.members : null
      const upstreamMembers = upstreamSelection?.ok ? upstreamSelection.members : null
      const selectedMembers = mergeInMembers ?? mergeOutMembers ?? upstreamMembers ?? syncMembers
      if (input.kind === 'batch-merge-in' && mergeInMembers) {
        const sources = mergeInMembers.map((member) => ({
          repositoryName: member.repositoryName,
          source: member.source.source,
        }))
        if (
          state.mergeExecution &&
          (state.mergeExecution.kind !== input.kind ||
            state.mergeExecution.mode !== input.mode ||
            !sameBatchMergeInSources(state.mergeExecution.sources, sources))
        ) {
          return { ok: false, message: 'error.invalid-arguments' }
        }
        state.mergeExecution ??= { kind: input.kind, mode: input.mode, sources }
      }
      if (input.kind === 'batch-merge-out' && mergeOutMembers) {
        const targets = mergeOutMembers.map((member) => ({
          repositoryName: member.repositoryName,
          destination: member.destination.destination,
        }))
        if (input.mode === 'merge' && targets.some((target) => target.destination.kind === 'remote')) {
          return {
            ok: false,
            message: 'workspace.branch-workspace.git-action.remote-destination-requires-push',
          }
        }
        if (
          state.mergeExecution &&
          (state.mergeExecution.kind !== input.kind ||
            state.mergeExecution.mode !== input.mode ||
            !sameBatchMergeOutTargets(state.mergeExecution.targets, targets))
        ) {
          return { ok: false, message: 'error.invalid-arguments' }
        }
        state.mergeExecution ??= { kind: input.kind, mode: input.mode, targets }
      }
      if (input.kind === 'batch-set-upstream' && upstreamMembers) {
        const upstreams = upstreamMembers.map<BranchWorkspaceBatchSetUpstreamInput>((member) =>
          member.action === 'set'
            ? { repositoryName: member.repositoryName, action: 'set', remoteRef: member.remoteRef }
            : { repositoryName: member.repositoryName, action: 'unset' },
        )
        if (
          state.upstreamExecution &&
          (state.upstreamExecution.kind !== input.kind ||
            !sameBatchSetUpstreams(state.upstreamExecution.upstreams, upstreams))
        ) {
          return { ok: false, message: 'error.invalid-arguments' }
        }
        state.upstreamExecution ??= { kind: input.kind, upstreams }
      }
      if (input.kind === 'push' && pushSelection?.ok) {
        const targets = pushSelection.members.map<BranchWorkspaceBatchPushTargetInput>((member) =>
          member.action === 'create-upstream'
            ? { repositoryName: member.repositoryName, action: member.action, remote: member.remote }
            : { repositoryName: member.repositoryName, action: member.action },
        )
        if (state.pushExecution && !sameBatchPushTargets(state.pushExecution.targets, targets)) {
          return { ok: false, message: 'error.invalid-arguments' }
        }
        state.pushExecution ??= { kind: 'push', targets }
      }

      const controller = new AbortController()
      const progressMembers = selectedMembers ?? state.plan.members
      const totalCount = progressMembers.length
      const completedRepositoryNames = progressMembers
        .map((member) => member.repositoryName)
        .filter((repositoryName) => state.completed.has(repositoryName))
      const touchedRepoIds = new Set<string>()
      let operationPublished = false
      active.set(normalizedRootId, {
        branchWorkspaceId: state.plan.branchWorkspaceId,
        controller,
        snapshot: {
          kind: state.plan.kind,
          currentStep: 0,
          completedCount: completedRepositoryNames.length,
          totalCount,
          cancellable: true,
          ...(completedRepositoryNames.length > 0 ? { completedRepositoryNames } : {}),
        },
        startedRepositoryNames: new Set(completedRepositoryNames),
        memberOrder: new Map(progressMembers.map((member, index) => [member.repositoryName, index])),
      })
      const executionContext: ActionExecutionContext = {
        rootId: normalizedRootId,
        active,
        touchedRepoIds,
        publishOperationUpdate,
      }

      try {
        const ignored = new Set([
          ...state.completed,
          ...state.mergeProgress.keys(),
          ...(selectedMembers
            ? state.plan.members
                .filter(
                  (member) => !selectedMembers.some((selected) => selected.repositoryName === member.repositoryName),
                )
                .map((member) => member.repositoryName)
            : []),
        ])
        const validation = await validatePlan(state.plan, ignored, dependencies.planDependencies, controller.signal)
        if (!validation.ok) return validation
        operationPublished = true
        publishActiveOperation(executionContext)
        if (input.kind === 'batch-commit') {
          return await executeBatchCommit(state, input, controller.signal, commit, executionContext)
        }
        if (input.kind === 'batch-discard') {
          return await executeBatchDiscard(state, controller.signal, discard, executionContext)
        }
        if (input.kind === 'batch-align-remote') {
          return await executeBatchAlignRemote(state, controller.signal, alignRemote, executionContext)
        }
        if (input.kind === 'batch-merge-in') {
          const execution = state.mergeExecution
          if (!execution || execution.kind !== input.kind) {
            return { ok: false, message: 'error.invalid-arguments' }
          }
          const refreshedSelection = selectedBatchMergeInMembers(validation.plan, execution.sources)
          if (!refreshedSelection.ok) return { ok: false, message: refreshedSelection.message }
          if (
            input.mode === 'pull-merge-push' &&
            refreshedSelection.members.some((member) => !member.pullMergePushReady)
          ) {
            return { ok: false, message: 'workspace.branch-workspace.git-action.target-upstream-required' }
          }
          return await executeBatchMergeIn(
            state,
            refreshedSelection.members,
            input.mode,
            controller.signal,
            { pull, fetchRemote, merge, push },
            async (refreshSignal) =>
              await buildPlan(
                state.plan.rootId,
                { kind: 'batch-merge-in', branchWorkspaceId: state.plan.branchWorkspaceId },
                dependencies.planDependencies,
                refreshSignal,
              ),
            executionContext,
          )
        }
        if (input.kind === 'batch-merge-out') {
          const execution = state.mergeExecution
          if (!execution || execution.kind !== input.kind) {
            return { ok: false, message: 'error.invalid-arguments' }
          }
          const refreshedSelection = selectedBatchMergeOutMembers(validation.plan, execution.targets)
          if (!refreshedSelection.ok) return { ok: false, message: refreshedSelection.message }
          if (
            input.mode === 'pull-merge-push' &&
            refreshedSelection.members.some((member) => !member.destination.pullMergePushReady)
          ) {
            return { ok: false, message: 'workspace.branch-workspace.git-action.destination-upstream-required' }
          }
          return await executeBatchMergeOut(
            state,
            refreshedSelection.members,
            input.mode,
            controller.signal,
            { pull, fetchRemote, merge, push, pushWorktreeHead, createWorktree, removeWorktree },
            async (refreshSignal) =>
              await buildPlan(
                state.plan.rootId,
                { kind: 'batch-merge-out', branchWorkspaceId: state.plan.branchWorkspaceId },
                dependencies.planDependencies,
                refreshSignal,
              ),
            executionContext,
          )
        }
        if (input.kind === 'batch-set-upstream') {
          const execution = state.upstreamExecution
          if (!execution || execution.kind !== input.kind) {
            return { ok: false, message: 'error.invalid-arguments' }
          }
          const refreshedSelection = selectedBatchSetUpstreamMembers(validation.plan, execution.upstreams)
          if (!refreshedSelection.ok) return { ok: false, message: refreshedSelection.message }
          const skippedRepositoryNames = new Set(
            state.plan.members
              .filter(
                (member) =>
                  !refreshedSelection.members.some(
                    (selectedMember) => selectedMember.repositoryName === member.repositoryName,
                  ),
              )
              .map((member) => member.repositoryName),
          )
          return await executeBatchSetUpstream(
            state,
            refreshedSelection.members,
            controller.signal,
            setUpstream,
            executionContext,
            skippedRepositoryNames,
          )
        }
        if (input.kind === 'push') {
          const execution = state.pushExecution
          if (!execution) return { ok: false, message: 'error.invalid-arguments' }
          const refreshedSelection = selectedBatchPushMembers(validation.plan, execution.targets, state.completed)
          if (!refreshedSelection.ok) return { ok: false, message: refreshedSelection.message }
          return await executeSync(
            state,
            input.kind,
            refreshedSelection.members,
            controller.signal,
            { pull, push },
            executionContext,
          )
        }
        if (!syncMembers || input.kind !== 'pull') return { ok: false, message: 'error.invalid-arguments' }
        return await executeSync(state, input.kind, syncMembers, controller.signal, { pull, push }, executionContext)
      } catch (error) {
        return failureResult(state.plan, state.completed, controller.signal.aborted ? 'cancelled' : safeMessage(error))
      } finally {
        active.delete(normalizedRootId)
        if (operationPublished) {
          publishOperationUpdate(normalizedRootId, state.plan.branchWorkspaceId, null)
        }
        for (const repoId of touchedRepoIds) publishRepoInvalidation(repoId)
      }
    },

    abort(rootId) {
      const operation = active.get(workspaceRootId(rootId))
      if (!operation) return false
      operation.controller.abort()
      return true
    },

    activeOperation(rootId, branchWorkspaceId) {
      const operation = active.get(workspaceRootId(rootId))
      return operation?.branchWorkspaceId === branchWorkspaceId ? { ...operation.snapshot } : null
    },
  }
}

function sameBatchMergeInSources(
  left: BranchWorkspaceBatchMergeInSourceInput[],
  right: BranchWorkspaceBatchMergeInSourceInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (source, index) =>
        source.repositoryName === right[index]?.repositoryName &&
        repositoryMergeBranchSelectionKey(source.source) ===
          (right[index] ? repositoryMergeBranchSelectionKey(right[index].source) : undefined),
    )
  )
}

function sameBatchMergeOutTargets(
  left: BranchWorkspaceBatchMergeOutTargetInput[],
  right: BranchWorkspaceBatchMergeOutTargetInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (target, index) =>
        target.repositoryName === right[index]?.repositoryName &&
        repositoryMergeBranchSelectionKey(target.destination) ===
          (right[index] ? repositoryMergeBranchSelectionKey(right[index].destination) : undefined),
    )
  )
}

function sameBatchSetUpstreams(
  left: BranchWorkspaceBatchSetUpstreamInput[],
  right: BranchWorkspaceBatchSetUpstreamInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((upstream, index) => {
      const candidate = right[index]
      if (!candidate || upstream.repositoryName !== candidate.repositoryName || upstream.action !== candidate.action) {
        return false
      }
      return upstream.action === 'unset' || (candidate.action === 'set' && upstream.remoteRef === candidate.remoteRef)
    })
  )
}

function sameBatchPushTargets(
  left: BranchWorkspaceBatchPushTargetInput[],
  right: BranchWorkspaceBatchPushTargetInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every((target, index) => {
      const candidate = right[index]
      if (!candidate || target.repositoryName !== candidate.repositoryName || target.action !== candidate.action) {
        return false
      }
      return target.action === 'push' || (candidate.action === 'create-upstream' && target.remote === candidate.remote)
    })
  )
}

function selectedBatchMergeInMembers(
  plan: BranchWorkspaceGitActionPlan,
  sources: BranchWorkspaceBatchMergeInSourceInput[],
): { ok: true; members: BranchWorkspaceBatchMergeInExecutionMember[] } | { ok: false; message: string } {
  if (plan.kind !== 'batch-merge-in') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Map(sources.map((source) => [source.repositoryName, source.source]))
  const members: BranchWorkspaceBatchMergeInExecutionMember[] = []
  for (const member of plan.members) {
    const sourceSelection = selected.get(member.repositoryName)
    if (!sourceSelection) continue
    if (!member.ready || (sourceSelection.kind === 'local' && sourceSelection.branch === member.targetBranch)) {
      return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    }
    const sourceKey = repositoryMergeBranchSelectionKey(sourceSelection)
    const source = member.sourceBranches.find(
      (candidate) => repositoryMergeBranchSelectionKey(candidate.source) === sourceKey,
    )
    if (!source) return { ok: false, message: 'error.invalid-arguments' }
    members.push({ ...member, source })
  }
  return members.length === selected.size && members.length > 0
    ? { ok: true, members }
    : { ok: false, message: 'error.invalid-arguments' }
}

function selectedBatchMergeOutMembers(
  plan: BranchWorkspaceGitActionPlan,
  targets: BranchWorkspaceBatchMergeOutTargetInput[],
): { ok: true; members: BranchWorkspaceBatchMergeOutExecutionMember[] } | { ok: false; message: string } {
  if (plan.kind !== 'batch-merge-out') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Map(targets.map((target) => [target.repositoryName, target.destination]))
  const members: BranchWorkspaceBatchMergeOutExecutionMember[] = []
  for (const member of plan.members) {
    const destinationSelection = selected.get(member.repositoryName)
    if (!destinationSelection) continue
    if (
      !member.ready ||
      (destinationSelection.kind === 'local' && destinationSelection.branch === member.targetBranch)
    ) {
      return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    }
    const destinationKey = repositoryMergeBranchSelectionKey(destinationSelection)
    const destination = member.destinationBranches.find(
      (candidate) => repositoryMergeBranchSelectionKey(candidate.destination) === destinationKey,
    )
    if (!destination || !destination.ready) {
      return { ok: false, message: destination?.message ?? 'error.invalid-arguments' }
    }
    members.push({ ...member, destination })
  }
  return members.length === selected.size && members.length > 0
    ? { ok: true, members }
    : { ok: false, message: 'error.invalid-arguments' }
}

function selectedBatchSetUpstreamMembers(
  plan: BranchWorkspaceGitActionPlan,
  upstreams: BranchWorkspaceBatchSetUpstreamInput[],
): { ok: true; members: BranchWorkspaceBatchSetUpstreamExecutionMember[] } | { ok: false; message: string } {
  if (plan.kind !== 'batch-set-upstream') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Map(upstreams.map((upstream) => [upstream.repositoryName, upstream]))
  const members: BranchWorkspaceBatchSetUpstreamExecutionMember[] = []
  for (const member of plan.members) {
    const upstream = selected.get(member.repositoryName)
    if (!upstream) continue
    if (!member.ready) return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    if (
      upstream.action === 'set' &&
      !member.remoteBranches.some((candidate) => candidate.remoteRef === upstream.remoteRef)
    ) {
      return { ok: false, message: 'error.invalid-arguments' }
    }
    members.push({ ...member, ...upstream })
  }
  return members.length === selected.size && members.length > 0
    ? { ok: true, members }
    : { ok: false, message: 'error.invalid-arguments' }
}

function selectedSyncMembers(
  plan: BranchWorkspaceGitActionPlan,
  repositoryNames: string[],
): { ok: true; members: BranchWorkspaceSyncMemberPlan[] } | { ok: false; message: string } {
  if (plan.kind !== 'pull' && plan.kind !== 'push') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Set(repositoryNames)
  const members: BranchWorkspaceSyncMemberPlan[] = []
  for (const member of plan.members) {
    if (!selected.has(member.repositoryName)) continue
    if (!member.ready) return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    members.push(member)
  }
  return members.length === selected.size && members.length > 0
    ? { ok: true, members }
    : { ok: false, message: 'error.invalid-arguments' }
}

function selectedBatchPushMembers(
  plan: BranchWorkspaceGitActionPlan,
  targets: BranchWorkspaceBatchPushTargetInput[],
  completed: ReadonlySet<string> = new Set(),
): { ok: true; members: BranchWorkspaceBatchPushExecutionMember[] } | { ok: false; message: string } {
  if (plan.kind !== 'push') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Map(targets.map((target) => [target.repositoryName, target]))
  const members: BranchWorkspaceBatchPushExecutionMember[] = []
  for (const member of plan.members) {
    const target = selected.get(member.repositoryName)
    if (!target) continue
    if (!completed.has(member.repositoryName) && !member.ready) {
      return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    }
    if (completed.has(member.repositoryName)) {
      members.push({ ...member, ...target })
      continue
    }
    if (member.requiresUpstreamCreation) {
      if (target.action !== 'create-upstream' || !member.pushRemotes.includes(target.remote)) {
        return { ok: false, message: 'error.invalid-arguments' }
      }
    } else if (target.action !== 'push') {
      return { ok: false, message: 'error.invalid-arguments' }
    }
    members.push({ ...member, ...target })
  }
  return members.length === selected.size && members.length > 0
    ? { ok: true, members }
    : { ok: false, message: 'error.invalid-arguments' }
}

function validBatchMessages(
  plan: BranchWorkspaceGitActionPlan,
  input: Extract<BranchWorkspaceGitActionExecuteInput, { kind: 'batch-commit' }>,
): boolean {
  if (plan.kind !== 'batch-commit') return false
  const expected = plan.members.filter((member) => member.dirty).map((member) => member.repositoryName)
  const actual = input.messages.map((message) => message.repositoryName)
  return expected.length === actual.length && expected.every((repositoryName) => actual.includes(repositoryName))
}

async function executeBatchCommit(
  state: PendingAction,
  input: Extract<BranchWorkspaceGitActionExecuteInput, { kind: 'batch-commit' }>,
  signal: AbortSignal,
  commit: typeof commitRepositoryChanges,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-commit') return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  const messages = new Map(input.messages.map((message) => [message.repositoryName, message.message]))
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  const members = state.plan.members.filter((member) => member.dirty && !state.completed.has(member.repositoryName))
  await runBatchMembersConcurrently(members, signal, async (member) => {
    updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'commit', state.completed)
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const result = await attemptMemberOperation(() =>
      commit(
        member.repoId,
        member.targetWorktreePath,
        messages.get(member.repositoryName)!,
        signal,
        undefined,
        DEFER_REPOSITORY_INVALIDATION,
      ),
    )
    if (!result.ok) {
      if (!signal.aborted) {
        recordActionFailure(failures, member.repositoryName, 'commit', result, member.targetWorktreePath)
      }
      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
      publishActiveOperation(context)
      return
    }
    state.completed.add(member.repositoryName)
    updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
    publishActiveOperation(context)
  })
  if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
  return executionResult(state.plan, state.completed, failures)
}

async function executeBatchDiscard(
  state: PendingAction,
  signal: AbortSignal,
  discard: typeof discardRepositoryChanges,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-discard') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  for (let index = 0; index < state.plan.members.length; index += 1) {
    const member = state.plan.members[index]!
    if (member.paths.length === 0 || state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'discard')
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const result = await attemptMemberOperation(() =>
      discard(member.repoId, member.targetWorktreePath, member.paths, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
    )
    if (!result.ok) {
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
      recordActionFailure(failures, member.repositoryName, 'discard', result, member.targetWorktreePath)
      continue
    }
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
  return executionResult(state.plan, state.completed, failures)
}

async function executeBatchAlignRemote(
  state: PendingAction,
  signal: AbortSignal,
  alignRemote: typeof alignRepositoryWorktreeToRemote,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-align-remote') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  let retryable = true
  for (let index = 0; index < state.plan.members.length; index += 1) {
    const member = state.plan.members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'align')
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const result = await attemptMemberOperation(() =>
      alignRemote(member.repoId, member.targetBranch, member.targetWorktreePath, signal, undefined, {
        ...DEFER_REPOSITORY_INVALIDATION,
        expectedFingerprint: member.fingerprint,
      }),
    )
    if (!result.ok) {
      recordActionFailure(failures, member.repositoryName, 'align', result, member.targetWorktreePath)
      if (result.repoChanged) {
        retryable = false
        state.requiresReplan = true
        if (signal.aborted) return executionResult(state.plan, state.completed, failures, new Set(), false)
      }
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
      continue
    }
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
  return executionResult(state.plan, state.completed, failures, new Set(), retryable)
}

async function executeBatchMergeIn(
  state: PendingAction,
  members: BranchWorkspaceBatchMergeInExecutionMember[],
  mode: BranchWorkspaceMergeMode,
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    fetchRemote: typeof fetchRepositoryRemote
    merge: typeof mergeRepositoryBranch
    push: typeof pushRepositoryBranch
  },
  refreshPlan: (signal: AbortSignal) => Promise<BranchWorkspaceGitActionPlanResult>,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-merge-in') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  const pendingMembers = members.filter((member) => !state.completed.has(member.repositoryName))
  await runBatchMembersConcurrently(pendingMembers, signal, async (member) => {
    try {
      let progress = state.mergeProgress.get(member.repositoryName)
      const sourceSelection = member.source.source
      const remoteSource = sourceSelection.kind === 'remote' ? parseRemoteBranchRef(sourceSelection.remoteRef) : null
      if (mode === 'pull-merge-push' && !progress) {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'pull', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const pulled = await attemptMemberOperation(() =>
          operations.pull(
            member.repoId,
            member.targetBranch,
            member.targetWorktreePath,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
        )
        if (!pulled.ok) {
          if (!signal.aborted) {
            recordActionFailure(failures, member.repositoryName, 'pull', pulled, member.targetWorktreePath)
          }
          return
        }
        progress = 'pulled'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) return
      }
      if (sourceSelection.kind === 'remote' && !remoteSource) {
        recordActionFailure(
          failures,
          member.repositoryName,
          'fetch',
          { ok: false, message: 'error.invalid-arguments' },
          member.targetWorktreePath,
        )
        return
      }
      if (remoteSource && (!progress || progress === 'pulled')) {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'fetch', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const fetched = await attemptMemberOperation(() =>
          operations.fetchRemote(member.repoId, remoteSource.remote, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
        )
        if (!fetched.ok) {
          if (!signal.aborted) {
            recordActionFailure(failures, member.repositoryName, 'fetch', fetched, member.targetWorktreePath)
          }
          return
        }
        progress = 'fetched'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) return
      }
      if (progress === 'pulled' || progress === 'fetched') {
        const refreshed = await attemptMemberPlanRefresh(() => refreshPlan(signal))
        if (!refreshed.ok) {
          if (!signal.aborted) {
            recordActionFailure(
              failures,
              member.repositoryName,
              'merge',
              { ok: false, message: refreshed.message },
              member.targetWorktreePath,
            )
          }
          return
        }
        if (signal.aborted) return
        const refreshedMember =
          refreshed.plan.kind === 'batch-merge-in'
            ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
            : undefined
        const refreshedSource = refreshedMember?.sourceBranches.find(
          (candidate) =>
            repositoryMergeBranchSelectionKey(candidate.source) === repositoryMergeBranchSelectionKey(sourceSelection),
        )
        if (
          !refreshedMember?.ready ||
          refreshedMember.targetWorktreePath !== member.targetWorktreePath ||
          refreshedSource?.head !== member.source.head
        ) {
          recordActionFailure(
            failures,
            member.repositoryName,
            'merge',
            { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' },
            member.targetWorktreePath,
          )
          return
        }
        progress = 'verified'
        state.mergeProgress.set(member.repositoryName, progress)
      }
      if (progress !== 'merged' && progress !== 'pushed') {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'merge', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const merged = await attemptMemberOperation(() =>
          operations.merge(
            member.repoId,
            member.targetWorktreePath,
            sourceSelection.kind === 'local' ? sourceSelection.branch : repositoryMergeBranchFullRef(sourceSelection),
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
        )
        if (!merged.ok) {
          if (!signal.aborted) {
            recordActionFailure(
              failures,
              member.repositoryName,
              'merge',
              merged,
              member.targetWorktreePath,
              retainedConflictWorktree(merged, member.targetBranch, member.targetWorktreePath),
            )
          }
          return
        }
        progress = 'merged'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) return
      }
      if (mode === 'pull-merge-push' && progress !== 'pushed') {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'push', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const pushed = await attemptMemberOperation(() =>
          operations.push(member.repoId, member.targetBranch, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
        )
        if (!pushed.ok) {
          if (!signal.aborted) {
            recordActionFailure(failures, member.repositoryName, 'push', pushed, member.targetWorktreePath)
          }
          return
        }
        progress = 'pushed'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) return
      }

      state.mergeProgress.delete(member.repositoryName)
      state.completed.add(member.repositoryName)
    } finally {
      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
      publishActiveOperation(context)
    }
  })
  if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
  return executionResult(state.plan, state.completed, failures)
}

async function executeBatchMergeOut(
  state: PendingAction,
  members: BranchWorkspaceBatchMergeOutExecutionMember[],
  mode: 'merge' | 'pull-merge-push',
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    fetchRemote: typeof fetchRepositoryRemote
    merge: typeof mergeRepositoryBranch
    push: typeof pushRepositoryBranch
    pushWorktreeHead: typeof pushRepositoryWorktreeHeadToRemoteBranch
    createWorktree: typeof createRepositoryWorktree
    removeWorktree: typeof removeRepositoryWorktree
  },
  refreshPlan: (signal: AbortSignal) => Promise<BranchWorkspaceGitActionPlanResult>,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-merge-out') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  const pendingMembers = members.filter((member) => !state.completed.has(member.repositoryName))
  await runBatchMembersConcurrently(pendingMembers, signal, async (member) => {
    try {
      let progress = state.mergeProgress.get(member.repositoryName)
      const destinationSelection = member.destination.destination
      const remoteDestination =
        destinationSelection.kind === 'remote' ? parseRemoteBranchRef(destinationSelection.remoteRef) : null
      if (destinationSelection.kind === 'remote' && !remoteDestination) {
        recordActionFailure(
          failures,
          member.repositoryName,
          'fetch',
          { ok: false, message: 'error.invalid-arguments' },
          member.targetWorktreePath,
        )
        return
      }
      if (remoteDestination && !progress) {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'fetch', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const fetched = await attemptMemberOperation(() =>
          operations.fetchRemote(
            member.repoId,
            remoteDestination.remote,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
        )
        if (!fetched.ok) {
          if (!signal.aborted) {
            recordActionFailure(failures, member.repositoryName, 'fetch', fetched, member.targetWorktreePath)
          }
          return
        }
        progress = 'fetched'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) return
      }
      if (remoteDestination && progress === 'fetched') {
        const refreshed = await attemptMemberPlanRefresh(() => refreshPlan(signal))
        if (!refreshed.ok) {
          state.mergeProgress.delete(member.repositoryName)
          if (!signal.aborted) {
            recordActionFailure(
              failures,
              member.repositoryName,
              'fetch',
              { ok: false, message: refreshed.message },
              member.targetWorktreePath,
            )
          }
          return
        }
        if (signal.aborted) return
        const refreshedMember =
          refreshed.plan.kind === 'batch-merge-out'
            ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
            : undefined
        const refreshedDestination = refreshedMember?.destinationBranches.find(
          (candidate) =>
            repositoryMergeBranchSelectionKey(candidate.destination) ===
            repositoryMergeBranchSelectionKey(destinationSelection),
        )
        if (
          !refreshedMember?.ready ||
          refreshedMember.targetHead !== member.targetHead ||
          !refreshedDestination?.ready ||
          refreshedDestination.head !== member.destination.head
        ) {
          state.mergeProgress.delete(member.repositoryName)
          recordActionFailure(
            failures,
            member.repositoryName,
            'fetch',
            { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' },
            member.targetWorktreePath,
          )
          return
        }
        progress = 'verified'
        state.mergeProgress.set(member.repositoryName, progress)
      }

      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'prepare', state.completed)
      publishActiveOperation(context)
      const prepared = await prepareBatchMergeDestination(state, member, signal, operations, context)
      if (!prepared.ok) {
        const failurePath = prepared.worktreePath ?? member.destination.worktreePath ?? member.targetWorktreePath
        const failure = await batchMergeFailureAfterCleanup(
          state,
          member,
          'prepare',
          prepared,
          failurePath,
          operations.removeWorktree,
          context,
        )
        if (!signal.aborted) failures.set(member.repositoryName, failure)
        return
      }
      if (signal.aborted) {
        await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
        return
      }
      const destinationWorktreePath = prepared.worktreePath
      if (!destinationWorktreePath) {
        recordActionFailure(
          failures,
          member.repositoryName,
          'prepare',
          { ok: false, message: 'workspace.branch-workspace.git-action.destination-worktree-unavailable' },
          member.destination.worktreePath ?? member.targetWorktreePath,
        )
        return
      }

      if (destinationSelection.kind === 'local' && mode === 'pull-merge-push' && !progress) {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'pull', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const pulled = await attemptMemberOperation(() =>
          operations.pull(
            member.repoId,
            destinationSelection.branch,
            destinationWorktreePath,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
        )
        if (!pulled.ok) {
          const failure = await batchMergeFailureAfterCleanup(
            state,
            member,
            'pull',
            pulled,
            destinationWorktreePath,
            operations.removeWorktree,
            context,
          )
          if (!signal.aborted) failures.set(member.repositoryName, failure)
          return
        }
        progress = 'pulled'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) {
          await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
          return
        }
      }
      if (destinationSelection.kind === 'local' && progress === 'pulled') {
        const refreshed = await attemptMemberPlanRefresh(() => refreshPlan(signal))
        if (!refreshed.ok) {
          const failure = await batchMergeFailureAfterCleanup(
            state,
            member,
            'merge',
            { ok: false, message: refreshed.message },
            destinationWorktreePath,
            operations.removeWorktree,
            context,
          )
          if (!signal.aborted) failures.set(member.repositoryName, failure)
          return
        }
        if (signal.aborted) {
          await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
          return
        }
        const refreshedMember =
          refreshed.plan.kind === 'batch-merge-out'
            ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
            : undefined
        const refreshedDestination = refreshedMember?.destinationBranches.find(
          (candidate) =>
            repositoryMergeBranchSelectionKey(candidate.destination) ===
            repositoryMergeBranchSelectionKey(destinationSelection),
        )
        if (
          !refreshedMember?.ready ||
          refreshedMember.targetHead !== member.targetHead ||
          !refreshedDestination?.ready ||
          refreshedDestination.worktreePath !== destinationWorktreePath
        ) {
          const failure = await batchMergeFailureAfterCleanup(
            state,
            member,
            'merge',
            { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' },
            destinationWorktreePath,
            operations.removeWorktree,
            context,
          )
          if (!signal.aborted) failures.set(member.repositoryName, failure)
          return
        }
        progress = 'verified'
        state.mergeProgress.set(member.repositoryName, progress)
      }
      if (progress !== 'merged' && progress !== 'pushed') {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'merge', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const merged = await attemptMemberOperation(() =>
          operations.merge(
            member.repoId,
            destinationWorktreePath,
            destinationSelection.kind === 'remote'
              ? repositoryMergeBranchFullRef({ kind: 'local', branch: member.targetBranch })
              : member.targetBranch,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
        )
        if (!merged.ok) {
          const failure = await batchMergeFailureAfterCleanup(
            state,
            member,
            'merge',
            merged,
            destinationWorktreePath,
            operations.removeWorktree,
            context,
          )
          if (!signal.aborted) failures.set(member.repositoryName, failure)
          return
        }
        progress = 'merged'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) {
          await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
          return
        }
      }
      if (mode === 'pull-merge-push' && progress !== 'pushed') {
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'push', state.completed)
        publishActiveOperation(context)
        context.touchedRepoIds.add(member.repoId)
        const pushed = await attemptMemberOperation(() =>
          destinationSelection.kind === 'remote'
            ? operations.pushWorktreeHead(
                member.repoId,
                destinationWorktreePath,
                destinationSelection.remoteRef,
                signal,
                undefined,
                DEFER_REPOSITORY_INVALIDATION,
              )
            : operations.push(
                member.repoId,
                destinationSelection.branch,
                signal,
                undefined,
                DEFER_REPOSITORY_INVALIDATION,
              ),
        )
        if (!pushed.ok) {
          const failure = await batchMergeFailureAfterCleanup(
            state,
            member,
            'push',
            pushed,
            destinationWorktreePath,
            operations.removeWorktree,
            context,
          )
          if (!signal.aborted) failures.set(member.repositoryName, failure)
          return
        }
        progress = 'pushed'
        state.mergeProgress.set(member.repositoryName, progress)
        if (signal.aborted) {
          await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
          return
        }
      }

      const cleaned = await cleanupBatchMergeTemporaryWorktree(state, member, operations.removeWorktree, context)
      if (!cleaned.ok) {
        if (!signal.aborted) {
          recordActionFailure(failures, member.repositoryName, 'cleanup', cleaned, destinationWorktreePath)
        }
        return
      }
      state.mergeProgress.delete(member.repositoryName)
      state.completed.add(member.repositoryName)
    } finally {
      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
      publishActiveOperation(context)
    }
  })
  if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
  return executionResult(state.plan, state.completed, failures)
}

async function prepareBatchMergeDestination(
  state: PendingAction,
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  signal: AbortSignal,
  operations: {
    createWorktree: typeof createRepositoryWorktree
    removeWorktree: typeof removeRepositoryWorktree
  },
  context: ActionExecutionContext,
): Promise<ExecResult & { worktreePath?: string }> {
  if (!member.destination.requiresTemporaryWorktree) {
    return member.destination.worktreePath
      ? { ok: true, message: '', worktreePath: member.destination.worktreePath }
      : { ok: false, message: 'workspace.branch-workspace.git-action.destination-worktree-unavailable' }
  }

  const stalePaths = new Set<string>()
  const retainedPath = state.mergeTemporaryWorktrees.get(member.repositoryName)
  if (retainedPath) stalePaths.add(retainedPath)
  if (member.destination.worktreePath) stalePaths.add(member.destination.worktreePath)
  for (const stalePath of stalePaths) {
    const removed = await removeBatchMergeTemporaryWorktree(member, stalePath, operations.removeWorktree, context)
    if (!removed.ok) return { ...removed, worktreePath: stalePath }
    state.mergeTemporaryWorktrees.delete(member.repositoryName)
    if (signal.aborted) return { ok: false, message: 'cancelled' }
  }

  const worktreePath = branchWorkspaceBatchMergeTemporaryWorktreePath(
    member.repoId,
    state.plan.token,
    repositoryMergeBranchSelectionKey(member.destination.destination),
  )
  if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
  context.touchedRepoIds.add(member.repoId)
  const created = await attemptMemberOperation(() =>
    operations.createWorktree(
      member.repoId,
      {
        worktreePath,
        mode:
          member.destination.destination.kind === 'local'
            ? { kind: 'existingBranch', branch: member.destination.destination.branch }
            : { kind: 'detached', ref: repositoryMergeBranchFullRef(member.destination.destination) },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      signal,
      undefined,
      DEFER_REPOSITORY_INVALIDATION,
    ),
  )
  if (created.ok || created.repoChanged === true) {
    state.mergeTemporaryWorktrees.set(member.repositoryName, worktreePath)
  }
  if (!created.ok) return { ...created, worktreePath }
  return { ...created, worktreePath }
}

async function batchMergeFailureAfterCleanup(
  state: PendingAction,
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  step: BranchWorkspaceGitActionMemberResult['step'],
  result: ExecResult,
  worktreePath: string,
  removeWorktree: typeof removeRepositoryWorktree,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionMemberResult> {
  const cleaned = await cleanupBatchMergeTemporaryWorktree(state, member, removeWorktree, context)
  if (cleaned.ok && member.destination.requiresTemporaryWorktree) {
    state.mergeProgress.delete(member.repositoryName)
  }
  const conflictWorktree =
    step === 'merge' && !member.destination.requiresTemporaryWorktree && member.destination.destination.kind === 'local'
      ? retainedConflictWorktree(result, member.destination.destination.branch, member.destination.worktreePath)
      : undefined
  return cleaned.ok
    ? memberFailure(member.repositoryName, step, result, worktreePath, conflictWorktree)
    : memberFailure(member.repositoryName, 'cleanup', cleaned, worktreePath)
}

async function cleanupBatchMergeTemporaryWorktree(
  state: PendingAction,
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  removeWorktree: typeof removeRepositoryWorktree,
  context: ActionExecutionContext,
): Promise<ExecResult> {
  const worktreePath = state.mergeTemporaryWorktrees.get(member.repositoryName)
  if (!worktreePath) return { ok: true, message: '' }
  updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, 'cleanup', state.completed)
  publishActiveOperation(context)
  const removed = await removeBatchMergeTemporaryWorktree(member, worktreePath, removeWorktree, context)
  if (removed.ok) state.mergeTemporaryWorktrees.delete(member.repositoryName)
  return removed
}

async function removeBatchMergeTemporaryWorktree(
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  worktreePath: string,
  removeWorktree: typeof removeRepositoryWorktree,
  context: ActionExecutionContext,
): Promise<ExecResult> {
  context.touchedRepoIds.add(member.repoId)
  return await attemptMemberOperation(() =>
    removeWorktree(
      member.repoId,
      {
        branch: batchMergeDestinationBranch(member.destination.destination),
        worktreePath,
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
      },
      undefined,
      undefined,
      DEFER_REPOSITORY_INVALIDATION,
    ),
  )
}

function batchMergeDestinationBranch(selection: RepositoryMergeBranchSelection): string {
  if (selection.kind === 'local') return selection.branch
  return parseRemoteBranchRef(selection.remoteRef)?.branch ?? selection.remoteRef
}

async function executeBatchSetUpstream(
  state: PendingAction,
  members: BranchWorkspaceBatchSetUpstreamExecutionMember[],
  signal: AbortSignal,
  setUpstream: SetRepositoryBranchUpstream,
  context: ActionExecutionContext,
  skippedRepositoryNames: ReadonlySet<string>,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-set-upstream') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled', skippedRepositoryNames)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'upstream')
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const result = await attemptMemberOperation(() =>
      setUpstream(
        member.repoId,
        member.targetBranch,
        member.action === 'set' ? member.remoteRef : null,
        signal,
        undefined,
        DEFER_REPOSITORY_INVALIDATION,
      ),
    )
    if (!result.ok) {
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled', skippedRepositoryNames)
      return executionResult(
        state.plan,
        state.completed,
        new Map([
          [member.repositoryName, memberFailure(member.repositoryName, 'upstream', result, member.targetWorktreePath)],
        ]),
        skippedRepositoryNames,
      )
    }
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
  return successResult(state.plan, state.completed)
}

async function executeSync(
  state: PendingAction,
  kind: 'pull' | 'push',
  members: BranchWorkspaceSyncMemberPlan[] | BranchWorkspaceBatchPushExecutionMember[],
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    push: typeof pushRepositoryBranch
  },
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'pull' && state.plan.kind !== 'push') {
    return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  }
  const plan = state.plan
  if (plan.kind !== kind) return failureResult(plan, state.completed, 'error.invalid-arguments')
  const selectedRepositoryNames = new Set(members.map((member) => member.repositoryName))
  const skippedRepositoryNames = new Set(
    plan.members
      .filter((member) => !selectedRepositoryNames.has(member.repositoryName))
      .map((member) => member.repositoryName),
  )
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  if (kind === 'pull') {
    const pendingMembers = members.filter((member) => !state.completed.has(member.repositoryName))
    await runBatchMembersConcurrently(pendingMembers, signal, async (member) => {
      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, kind, state.completed)
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const result = await attemptMemberOperation(
        async () =>
          await operations.pull(
            member.repoId,
            member.targetBranch,
            member.targetWorktreePath,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          ),
      )
      if (!result.ok) {
        if (!signal.aborted) {
          recordActionFailure(failures, member.repositoryName, kind, result, member.targetWorktreePath)
        }
        updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
        publishActiveOperation(context)
        return
      }
      state.completed.add(member.repositoryName)
      updateConcurrentActive(context.active.get(context.rootId), member.repositoryName, undefined, state.completed)
      publishActiveOperation(context)
    })
    if (signal.aborted) return failureResult(plan, state.completed, 'cancelled')
    return executionResult(plan, state.completed, failures, skippedRepositoryNames)
  }
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(plan, state.completed, 'cancelled')
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, kind)
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const pushOptions =
      'action' in member && member.action === 'create-upstream'
        ? { ...DEFER_REPOSITORY_INVALIDATION, createUpstreamRemote: member.remote }
        : DEFER_REPOSITORY_INVALIDATION
    const result = await attemptMemberOperation(async () =>
      operations.push(member.repoId, member.targetBranch, signal, undefined, pushOptions),
    )
    if (!result.ok) {
      if (signal.aborted) return failureResult(plan, state.completed, 'cancelled')
      recordActionFailure(failures, member.repositoryName, kind, result, member.targetWorktreePath)
      continue
    }
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
  return executionResult(plan, state.completed, failures, skippedRepositoryNames)
}

async function runBatchMembersConcurrently<T>(
  members: readonly T[],
  signal: AbortSignal,
  worker: (member: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = pLimit(BRANCH_WORKSPACE_BATCH_GIT_CONCURRENCY)
  await Promise.all(
    members.map((member, index) =>
      limit(async () => {
        if (signal.aborted) return
        await worker(member, index)
      }),
    ),
  )
}

function publishActiveOperation(context: ActionExecutionContext): void {
  const operation = context.active.get(context.rootId)
  if (!operation) return
  context.publishOperationUpdate(context.rootId, operation.branchWorkspaceId, { ...operation.snapshot })
}

function updateActive(
  operation: ActiveAction | undefined,
  currentStep: number,
  completedCount: number,
  repositoryName?: string,
  step?: BranchWorkspaceActiveOperation['step'],
): void {
  if (!operation) return
  operation.snapshot = {
    ...operation.snapshot,
    currentStep,
    completedCount,
    ...(repositoryName ? { repositoryName } : {}),
    ...(step ? { step } : {}),
  }
}

function updateConcurrentActive(
  operation: ActiveAction | undefined,
  repositoryName: string,
  step: NonNullable<BranchWorkspaceActiveOperation['step']> | undefined,
  completed: ReadonlySet<string>,
): void {
  if (!operation) return
  const activeMembers = new Map(
    (operation.snapshot.activeMembers ?? []).map((member) => [member.repositoryName, member.step]),
  )
  if (step) {
    operation.startedRepositoryNames.add(repositoryName)
    activeMembers.set(repositoryName, step)
  } else {
    activeMembers.delete(repositoryName)
  }
  const nextActiveMembers = [...activeMembers]
    .sort(
      ([left], [right]) =>
        (operation.memberOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (operation.memberOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([memberRepositoryName, memberStep]) => ({
      repositoryName: memberRepositoryName,
      step: memberStep,
    }))
  const completedRepositoryNames = [...operation.memberOrder.keys()].filter((memberRepositoryName) =>
    completed.has(memberRepositoryName),
  )
  const snapshot = { ...operation.snapshot }
  delete snapshot.repositoryName
  delete snapshot.step
  delete snapshot.activeMembers
  delete snapshot.completedRepositoryNames
  operation.snapshot = {
    ...snapshot,
    currentStep: Math.min(operation.snapshot.totalCount, operation.startedRepositoryNames.size),
    completedCount: completedRepositoryNames.length,
    ...(nextActiveMembers.length > 0 ? { activeMembers: nextActiveMembers } : {}),
    ...(completedRepositoryNames.length > 0 ? { completedRepositoryNames } : {}),
  }
}

function successResult(
  plan: BranchWorkspaceGitActionPlan,
  completed: ReadonlySet<string>,
): BranchWorkspaceGitActionResult {
  return {
    ok: true,
    kind: plan.kind,
    planToken: plan.token,
    branchWorkspaceId: plan.branchWorkspaceId,
    members: plan.members.map((member) => ({
      repositoryName: member.repositoryName,
      phase: completed.has(member.repositoryName) ? 'succeeded' : 'satisfied',
    })),
  }
}

function executionResult(
  plan: BranchWorkspaceGitActionPlan,
  completed: ReadonlySet<string>,
  failures: ReadonlyMap<string, BranchWorkspaceGitActionMemberResult>,
  satisfied: ReadonlySet<string> = new Set(),
  retryable = true,
): BranchWorkspaceGitActionResult {
  if (failures.size === 0) return successResult(plan, completed)
  return {
    ok: false,
    kind: plan.kind,
    planToken: plan.token,
    branchWorkspaceId: plan.branchWorkspaceId,
    message: 'workspace.branch-workspace.git-action.members-failed',
    ...(retryable ? {} : { retryable: false }),
    members: plan.members.map((member) => {
      const failure = failures.get(member.repositoryName)
      if (failure) return failure
      return {
        repositoryName: member.repositoryName,
        phase: completed.has(member.repositoryName)
          ? 'succeeded'
          : satisfied.has(member.repositoryName) || isInitiallySatisfied(plan, member.repositoryName)
            ? 'satisfied'
            : 'not-started',
      }
    }),
  }
}

function recordActionFailure(
  failures: BranchWorkspaceGitActionMemberFailures,
  repositoryName: string,
  step: BranchWorkspaceGitActionMemberResult['step'],
  result: ExecResult,
  worktreePath: string,
  conflictWorktree?: GitConflictWorktree,
): void {
  failures.set(repositoryName, memberFailure(repositoryName, step, result, worktreePath, conflictWorktree))
}

function memberFailure(
  repositoryName: string,
  step: BranchWorkspaceGitActionMemberResult['step'],
  result: ExecResult,
  worktreePath: string,
  conflictWorktree?: GitConflictWorktree,
): BranchWorkspaceGitActionMemberResult {
  return {
    repositoryName,
    phase: 'failed',
    step,
    message: result.message,
    worktreePath,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(conflictWorktree ? { conflictWorktree } : {}),
  }
}

function retainedConflictWorktree(
  result: ExecResult,
  branch: string,
  path: string | undefined,
): GitConflictWorktree | undefined {
  return result.reason === 'merge-conflict' && path ? { branch, path } : undefined
}

function failureResult(
  plan: BranchWorkspaceGitActionPlan,
  completed: ReadonlySet<string>,
  message: string,
  satisfied: ReadonlySet<string> = new Set(),
): BranchWorkspaceGitActionResult {
  return {
    ok: false,
    kind: plan.kind,
    planToken: plan.token,
    branchWorkspaceId: plan.branchWorkspaceId,
    message,
    members: plan.members.map((member) => ({
      repositoryName: member.repositoryName,
      phase: completed.has(member.repositoryName)
        ? 'succeeded'
        : satisfied.has(member.repositoryName) || isInitiallySatisfied(plan, member.repositoryName)
          ? 'satisfied'
          : 'not-started',
    })),
  }
}

async function attemptMemberOperation(operation: () => Promise<ExecResult>): Promise<ExecResult> {
  try {
    return await operation()
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
}

async function attemptMemberPlanRefresh(
  refresh: () => Promise<BranchWorkspaceGitActionPlanResult>,
): Promise<BranchWorkspaceGitActionPlanResult> {
  try {
    return await refresh()
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'workspace.branch-workspace.git-action.execute-failed'
}

function isInitiallySatisfied(plan: BranchWorkspaceGitActionPlan, repositoryName: string): boolean {
  if (plan.kind === 'batch-commit') {
    return plan.members.some((member) => member.repositoryName === repositoryName && !member.dirty)
  }
  if (plan.kind === 'batch-discard') {
    return plan.members.some((member) => member.repositoryName === repositoryName && member.paths.length === 0)
  }
  return false
}
