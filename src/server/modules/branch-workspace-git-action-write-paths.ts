import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanDependencies,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import { branchWorkspaceBatchMergeTemporaryWorktreePath } from '#/server/modules/branch-workspace-batch-merge-worktree.ts'
import { publishBranchWorkspaceOperationUpdate } from '#/server/modules/invalidation-broker.ts'
import {
  commitRepositoryChanges,
  createRepositoryWorktree,
  discardRepositoryChanges,
  mergeRepositoryBranch,
  publishRepositorySnapshotInvalidation,
  pullRepositoryBranch,
  pushRepositoryBranch,
  removeRepositoryWorktree,
} from '#/server/modules/repo-write-paths.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceBatchMergeInMemberPlan,
  type BranchWorkspaceBatchMergeInSourceInput,
  type BranchWorkspaceBatchMergeInSourcePlan,
  type BranchWorkspaceBatchMergeOutDestinationPlan,
  type BranchWorkspaceBatchMergeOutMemberPlan,
  type BranchWorkspaceBatchMergeOutTargetInput,
  type BranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceGitActionMemberResult,
  type BranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceGitActionPlanResult,
  type BranchWorkspaceGitActionResult,
  type BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import type { ExecResult, GitConflictWorktree } from '#/shared/git-types.ts'

interface PendingAction {
  plan: BranchWorkspaceGitActionPlan
  completed: Set<string>
  mergeProgress: Map<string, 'pulled' | 'merged' | 'pushed'>
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
}

type BranchWorkspaceBatchMergeInExecutionMember = BranchWorkspaceBatchMergeInMemberPlan & {
  source: BranchWorkspaceBatchMergeInSourcePlan
}

type BranchWorkspaceBatchMergeOutExecutionMember = BranchWorkspaceBatchMergeOutMemberPlan & {
  destination: BranchWorkspaceBatchMergeOutDestinationPlan
}

interface ActiveAction {
  branchWorkspaceId: string
  controller: AbortController
  snapshot: BranchWorkspaceActiveOperation
}

interface ActionExecutionContext {
  rootId: string
  active: Map<string, ActiveAction>
  touchedRepoIds: Set<string>
  publishOperationUpdate: typeof publishBranchWorkspaceOperationUpdate
}

type BranchWorkspaceGitActionMemberFailures = Map<string, BranchWorkspaceGitActionMemberResult>

const DEFER_REPOSITORY_INVALIDATION = { publishInvalidation: false } as const

export interface BranchWorkspaceGitActionWriteDependencies {
  planDependencies?: BranchWorkspaceGitActionPlanDependencies
  buildPlan?: typeof buildBranchWorkspaceGitActionPlan
  validatePlan?: typeof validateBranchWorkspaceGitActionPlan
  commit?: typeof commitRepositoryChanges
  discard?: typeof discardRepositoryChanges
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
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
  const pull = dependencies.pull ?? pullRepositoryBranch
  const merge = dependencies.merge ?? mergeRepositoryBranch
  const push = dependencies.push ?? pushRepositoryBranch
  const createWorktree = dependencies.createWorktree ?? createRepositoryWorktree
  const removeWorktree = dependencies.removeWorktree ?? removeRepositoryWorktree
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
      if (active.has(normalizedRootId)) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.operation-active' }
      }
      if (input.kind === 'batch-commit' && !validBatchMessages(state.plan, input)) {
        return { ok: false, message: 'error.invalid-arguments' }
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
      const mergeInMembers = mergeInSelection?.ok ? mergeInSelection.members : null
      const mergeOutMembers = mergeOutSelection?.ok ? mergeOutSelection.members : null
      const mergeMembers = mergeInMembers ?? mergeOutMembers
      if (input.kind === 'batch-merge-in' && mergeInMembers) {
        const sources = mergeInMembers.map((member) => ({
          repositoryName: member.repositoryName,
          sourceBranch: member.source.branch,
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
          destinationBranch: member.destination.branch,
        }))
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

      const controller = new AbortController()
      const totalCount = mergeMembers?.length ?? state.plan.members.length
      const touchedRepoIds = new Set<string>()
      let operationPublished = false
      active.set(normalizedRootId, {
        branchWorkspaceId: state.plan.branchWorkspaceId,
        controller,
        snapshot: {
          kind: state.plan.kind,
          currentStep: 0,
          completedCount: state.completed.size,
          totalCount,
          cancellable: true,
        },
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
          ...(mergeMembers
            ? state.plan.members
                .filter((member) => !mergeMembers.some((selected) => selected.repositoryName === member.repositoryName))
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
            { pull, merge, push },
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
            { pull, merge, push, createWorktree, removeWorktree },
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
        return await executeSync(state, input.kind, controller.signal, { pull, push }, executionContext)
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
        source.repositoryName === right[index]?.repositoryName && source.sourceBranch === right[index]?.sourceBranch,
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
        target.destinationBranch === right[index]?.destinationBranch,
    )
  )
}

function selectedBatchMergeInMembers(
  plan: BranchWorkspaceGitActionPlan,
  sources: BranchWorkspaceBatchMergeInSourceInput[],
): { ok: true; members: BranchWorkspaceBatchMergeInExecutionMember[] } | { ok: false; message: string } {
  if (plan.kind !== 'batch-merge-in') return { ok: false, message: 'error.invalid-arguments' }
  const selected = new Map(sources.map((source) => [source.repositoryName, source.sourceBranch]))
  const members: BranchWorkspaceBatchMergeInExecutionMember[] = []
  for (const member of plan.members) {
    const sourceBranch = selected.get(member.repositoryName)
    if (!sourceBranch) continue
    if (!member.ready || sourceBranch === member.targetBranch) {
      return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    }
    const source = member.sourceBranches.find((candidate) => candidate.branch === sourceBranch)
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
  const selected = new Map(targets.map((target) => [target.repositoryName, target.destinationBranch]))
  const members: BranchWorkspaceBatchMergeOutExecutionMember[] = []
  for (const member of plan.members) {
    const destinationBranch = selected.get(member.repositoryName)
    if (!destinationBranch) continue
    if (!member.ready || destinationBranch === member.targetBranch) {
      return { ok: false, message: member.message ?? 'error.invalid-arguments' }
    }
    const destination = member.destinationBranches.find((candidate) => candidate.branch === destinationBranch)
    if (!destination || !destination.ready) {
      return { ok: false, message: destination?.message ?? 'error.invalid-arguments' }
    }
    members.push({ ...member, destination })
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
  for (let index = 0; index < state.plan.members.length; index += 1) {
    const member = state.plan.members[index]!
    if (!member.dirty || state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'commit')
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
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
      recordActionFailure(failures, member.repositoryName, 'commit', result, member.targetWorktreePath)
      continue
    }
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
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

async function executeBatchMergeIn(
  state: PendingAction,
  members: BranchWorkspaceBatchMergeInExecutionMember[],
  mode: BranchWorkspaceMergeMode,
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
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
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')

    let progress = state.mergeProgress.get(member.repositoryName)
    if (mode === 'pull-merge-push' && !progress) {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'pull')
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
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        recordActionFailure(failures, member.repositoryName, 'pull', pulled, member.targetWorktreePath)
        continue
      }
      progress = 'pulled'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (progress === 'pulled') {
      const refreshed = await attemptMemberPlanRefresh(() => refreshPlan(signal))
      if (!refreshed.ok) {
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        recordActionFailure(
          failures,
          member.repositoryName,
          'merge',
          { ok: false, message: refreshed.message },
          member.targetWorktreePath,
        )
        continue
      }
      const refreshedMember =
        refreshed.plan.kind === 'batch-merge-in'
          ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          : undefined
      const refreshedSource = refreshedMember?.sourceBranches.find(
        (candidate) => candidate.branch === member.source.branch,
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
        continue
      }
    }
    if (progress !== 'merged' && progress !== 'pushed') {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'merge')
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const merged = await attemptMemberOperation(() =>
        operations.merge(
          member.repoId,
          member.targetWorktreePath,
          member.source.branch,
          signal,
          undefined,
          DEFER_REPOSITORY_INVALIDATION,
        ),
      )
      if (!merged.ok) {
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        recordActionFailure(
          failures,
          member.repositoryName,
          'merge',
          merged,
          member.targetWorktreePath,
          retainedConflictWorktree(merged, member.targetBranch, member.targetWorktreePath),
        )
        continue
      }
      progress = 'merged'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (mode === 'pull-merge-push' && progress !== 'pushed') {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'push')
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const pushed = await attemptMemberOperation(() =>
        operations.push(member.repoId, member.targetBranch, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
      )
      if (!pushed.ok) {
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        recordActionFailure(failures, member.repositoryName, 'push', pushed, member.targetWorktreePath)
        continue
      }
      progress = 'pushed'
      state.mergeProgress.set(member.repositoryName, progress)
    }

    state.mergeProgress.delete(member.repositoryName)
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
  return executionResult(state.plan, state.completed, failures)
}

async function executeBatchMergeOut(
  state: PendingAction,
  members: BranchWorkspaceBatchMergeOutExecutionMember[],
  mode: 'merge' | 'pull-merge-push',
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    merge: typeof mergeRepositoryBranch
    push: typeof pushRepositoryBranch
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
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')

    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'prepare')
    publishActiveOperation(context)
    const prepared = await prepareBatchMergeDestination(state, member, signal, operations, context)
    if (!prepared.ok) {
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
      recordActionFailure(
        failures,
        member.repositoryName,
        'prepare',
        prepared,
        prepared.worktreePath ?? member.destination.worktreePath ?? member.targetWorktreePath,
      )
      continue
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
      continue
    }

    let progress = state.mergeProgress.get(member.repositoryName)
    if (mode === 'pull-merge-push' && !progress) {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'pull')
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const pulled = await attemptMemberOperation(() =>
        operations.pull(
          member.repoId,
          member.destination.branch,
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
          index,
          'pull',
          pulled,
          destinationWorktreePath,
          operations.removeWorktree,
          context,
        )
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        failures.set(member.repositoryName, failure)
        continue
      }
      progress = 'pulled'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (progress === 'pulled') {
      const refreshed = await attemptMemberPlanRefresh(() => refreshPlan(signal))
      if (!refreshed.ok) {
        const failure = await batchMergeFailureAfterCleanup(
          state,
          member,
          index,
          'merge',
          { ok: false, message: refreshed.message },
          destinationWorktreePath,
          operations.removeWorktree,
          context,
        )
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        failures.set(member.repositoryName, failure)
        continue
      }
      const refreshedMember =
        refreshed.plan.kind === 'batch-merge-out'
          ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          : undefined
      const refreshedDestination = refreshedMember?.destinationBranches.find(
        (candidate) => candidate.branch === member.destination.branch,
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
          index,
          'merge',
          { ok: false, message: 'workspace.branch-workspace.git-action.repository-changed' },
          destinationWorktreePath,
          operations.removeWorktree,
          context,
        )
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        failures.set(member.repositoryName, failure)
        continue
      }
    }
    if (progress !== 'merged' && progress !== 'pushed') {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'merge')
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const merged = await attemptMemberOperation(() =>
        operations.merge(
          member.repoId,
          destinationWorktreePath,
          member.targetBranch,
          signal,
          undefined,
          DEFER_REPOSITORY_INVALIDATION,
        ),
      )
      if (!merged.ok) {
        const failure = await batchMergeFailureAfterCleanup(
          state,
          member,
          index,
          'merge',
          merged,
          destinationWorktreePath,
          operations.removeWorktree,
          context,
        )
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        failures.set(member.repositoryName, failure)
        continue
      }
      progress = 'merged'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (mode === 'pull-merge-push' && progress !== 'pushed') {
      updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'push')
      publishActiveOperation(context)
      context.touchedRepoIds.add(member.repoId)
      const pushed = await attemptMemberOperation(() =>
        operations.push(member.repoId, member.destination.branch, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
      )
      if (!pushed.ok) {
        const failure = await batchMergeFailureAfterCleanup(
          state,
          member,
          index,
          'push',
          pushed,
          destinationWorktreePath,
          operations.removeWorktree,
          context,
        )
        if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
        failures.set(member.repositoryName, failure)
        continue
      }
      progress = 'pushed'
      state.mergeProgress.set(member.repositoryName, progress)
    }

    const cleaned = await cleanupBatchMergeTemporaryWorktree(state, member, index, operations.removeWorktree, context)
    if (!cleaned.ok) {
      if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
      recordActionFailure(failures, member.repositoryName, 'cleanup', cleaned, destinationWorktreePath)
      continue
    }
    state.mergeProgress.delete(member.repositoryName)
    state.completed.add(member.repositoryName)
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size)
    publishActiveOperation(context)
  }
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
  }

  const worktreePath = branchWorkspaceBatchMergeTemporaryWorktreePath(
    member.repoId,
    state.plan.token,
    member.destination.branch,
  )
  if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
  context.touchedRepoIds.add(member.repoId)
  const created = await attemptMemberOperation(() =>
    operations.createWorktree(
      member.repoId,
      {
        worktreePath,
        mode: { kind: 'existingBranch', branch: member.destination.branch },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      signal,
      undefined,
      DEFER_REPOSITORY_INVALIDATION,
    ),
  )
  if (!created.ok) return { ...created, worktreePath }
  state.mergeTemporaryWorktrees.set(member.repositoryName, worktreePath)
  return { ...created, worktreePath }
}

async function batchMergeFailureAfterCleanup(
  state: PendingAction,
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  index: number,
  step: BranchWorkspaceGitActionMemberResult['step'],
  result: ExecResult,
  worktreePath: string,
  removeWorktree: typeof removeRepositoryWorktree,
  context: ActionExecutionContext,
): Promise<BranchWorkspaceGitActionMemberResult> {
  const cleaned = await cleanupBatchMergeTemporaryWorktree(state, member, index, removeWorktree, context)
  const conflictWorktree =
    step === 'merge' && !member.destination.requiresTemporaryWorktree
      ? retainedConflictWorktree(result, member.destination.branch, member.destination.worktreePath)
      : undefined
  return cleaned.ok
    ? memberFailure(member.repositoryName, step, result, worktreePath, conflictWorktree)
    : memberFailure(member.repositoryName, 'cleanup', cleaned, worktreePath)
}

async function cleanupBatchMergeTemporaryWorktree(
  state: PendingAction,
  member: BranchWorkspaceBatchMergeOutExecutionMember,
  index: number,
  removeWorktree: typeof removeRepositoryWorktree,
  context: ActionExecutionContext,
): Promise<ExecResult> {
  const worktreePath = state.mergeTemporaryWorktrees.get(member.repositoryName)
  if (!worktreePath) return { ok: true, message: '' }
  updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, 'cleanup')
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
        branch: member.destination.branch,
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

async function executeSync(
  state: PendingAction,
  kind: 'pull' | 'push',
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
  if (!plan.ready) {
    return failureResult(
      plan,
      state.completed,
      plan.members.find((member) => !member.ready)?.message ?? 'error.invalid-arguments',
    )
  }
  const failures: BranchWorkspaceGitActionMemberFailures = new Map()
  for (let index = 0; index < plan.members.length; index += 1) {
    const member = plan.members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(plan, state.completed, 'cancelled')
    updateActive(context.active.get(context.rootId), index + 1, state.completed.size, member.repositoryName, kind)
    publishActiveOperation(context)
    context.touchedRepoIds.add(member.repoId)
    const result = await attemptMemberOperation(async () =>
      kind === 'pull'
        ? await operations.pull(
            member.repoId,
            member.targetBranch,
            member.targetWorktreePath,
            signal,
            undefined,
            DEFER_REPOSITORY_INVALIDATION,
          )
        : await operations.push(member.repoId, member.targetBranch, signal, undefined, DEFER_REPOSITORY_INVALIDATION),
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
  return executionResult(plan, state.completed, failures)
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
): BranchWorkspaceGitActionResult {
  if (failures.size === 0) return successResult(plan, completed)
  return {
    ok: false,
    kind: plan.kind,
    planToken: plan.token,
    branchWorkspaceId: plan.branchWorkspaceId,
    message: 'workspace.branch-workspace.git-action.members-failed',
    members: plan.members.map((member) => {
      const failure = failures.get(member.repositoryName)
      if (failure) return failure
      return {
        repositoryName: member.repositoryName,
        phase: completed.has(member.repositoryName)
          ? 'succeeded'
          : isInitiallySatisfied(plan, member.repositoryName)
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
        : isInitiallySatisfied(plan, member.repositoryName)
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
