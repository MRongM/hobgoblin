import {
  buildBranchWorkspaceGitActionPlan,
  validateBranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanDependencies,
} from '#/server/modules/branch-workspace-git-action-plan.ts'
import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import {
  commitRepositoryChanges,
  mergeRepositoryBranch,
  pullRepositoryBranch,
  pushRepositoryBranch,
} from '#/server/modules/repo-write-paths.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceGitActionExecuteInput,
  type BranchWorkspaceGitActionMemberResult,
  type BranchWorkspaceGitActionPlan,
  type BranchWorkspaceGitActionPlanRequest,
  type BranchWorkspaceGitActionPlanResult,
  type BranchWorkspaceGitActionResult,
  type BranchWorkspaceMergeBackMemberPlan,
  type BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import type { ExecResult } from '#/shared/git-types.ts'

interface PendingAction {
  plan: BranchWorkspaceGitActionPlan
  completed: Set<string>
  mergeProgress: Map<string, 'pulled' | 'merged'>
  mergeExecution?: {
    mode: BranchWorkspaceMergeMode
    repositoryNames: string[]
  }
}

interface ActiveAction {
  branchWorkspaceId: string
  controller: AbortController
  snapshot: BranchWorkspaceActiveOperation
}

export interface BranchWorkspaceGitActionWriteDependencies {
  planDependencies?: BranchWorkspaceGitActionPlanDependencies
  buildPlan?: typeof buildBranchWorkspaceGitActionPlan
  validatePlan?: typeof validateBranchWorkspaceGitActionPlan
  commit?: typeof commitRepositoryChanges
  pull?: typeof pullRepositoryBranch
  merge?: typeof mergeRepositoryBranch
  push?: typeof pushRepositoryBranch
  publishInvalidation?: typeof publishWorkspaceInvalidation
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
  const pull = dependencies.pull ?? pullRepositoryBranch
  const merge = dependencies.merge ?? mergeRepositoryBranch
  const push = dependencies.push ?? pushRepositoryBranch
  const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceInvalidation

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
      const mergeMembers = input.kind === 'merge-back' ? selectedMergeMembers(state.plan, input.repositoryNames) : null
      if (input.kind === 'merge-back' && !mergeMembers) {
        return { ok: false, message: 'error.invalid-arguments' }
      }
      if (
        input.kind === 'merge-back' &&
        input.mode === 'pull-merge-push' &&
        mergeMembers?.some((member) => !member.pullMergePushReady)
      ) {
        return { ok: false, message: 'workspace.branch-workspace.git-action.base-upstream-required' }
      }
      if (input.kind === 'merge-back' && mergeMembers) {
        const repositoryNames = mergeMembers.map((member) => member.repositoryName)
        if (
          state.mergeExecution &&
          (state.mergeExecution.mode !== input.mode ||
            !sameRepositoryNames(state.mergeExecution.repositoryNames, repositoryNames))
        ) {
          return { ok: false, message: 'error.invalid-arguments' }
        }
        state.mergeExecution ??= { mode: input.mode, repositoryNames }
      }

      const controller = new AbortController()
      const totalCount = mergeMembers?.length ?? state.plan.members.length
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
      publishInvalidation(normalizedRootId)

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
        if (input.kind === 'batch-commit') {
          return await executeBatchCommit(
            normalizedRootId,
            state,
            input,
            controller.signal,
            commit,
            publishInvalidation,
            active,
          )
        }
        if (input.kind === 'merge-back') {
          return await executeMergeBack(
            normalizedRootId,
            state,
            mergeMembers!,
            input.mode,
            controller.signal,
            { pull, merge, push },
            async (refreshSignal) =>
              await buildPlan(
                state.plan.rootId,
                { kind: 'merge-back', branchWorkspaceId: state.plan.branchWorkspaceId },
                dependencies.planDependencies,
                refreshSignal,
              ),
            publishInvalidation,
            active,
          )
        }
        return await executeSync(
          normalizedRootId,
          state,
          input.kind,
          controller.signal,
          { pull, push },
          publishInvalidation,
          active,
        )
      } catch (error) {
        return failureResult(state.plan, state.completed, controller.signal.aborted ? 'cancelled' : safeMessage(error))
      } finally {
        active.delete(normalizedRootId)
        publishInvalidation(normalizedRootId)
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

function sameRepositoryNames(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index])
}

function selectedMergeMembers(
  plan: BranchWorkspaceGitActionPlan,
  repositoryNames: string[],
): BranchWorkspaceMergeBackMemberPlan[] | null {
  if (plan.kind !== 'merge-back') return null
  const selected = new Set(repositoryNames)
  const members = plan.members.filter((member) => selected.has(member.repositoryName))
  if (members.length !== selected.size || members.some((member) => member.mergeSatisfied)) return null
  return members
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
  rootId: string,
  state: PendingAction,
  input: Extract<BranchWorkspaceGitActionExecuteInput, { kind: 'batch-commit' }>,
  signal: AbortSignal,
  commit: typeof commitRepositoryChanges,
  publishInvalidation: typeof publishWorkspaceInvalidation,
  active: Map<string, ActiveAction>,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'batch-commit') return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  const messages = new Map(input.messages.map((message) => [message.repositoryName, message.message]))
  for (let index = 0; index < state.plan.members.length; index += 1) {
    const member = state.plan.members[index]!
    if (!member.dirty || state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
    updateActive(active.get(rootId), index + 1, state.completed.size, member.repositoryName, 'commit')
    publishInvalidation(rootId)
    const result = await commit(member.repoId, member.targetWorktreePath, messages.get(member.repositoryName)!, signal)
    if (!result.ok) return actionFailure(state.plan, state.completed, member.repositoryName, 'commit', result)
    state.completed.add(member.repositoryName)
    updateActive(active.get(rootId), index + 1, state.completed.size)
    publishInvalidation(rootId)
  }
  return successResult(state.plan, state.completed)
}

async function executeMergeBack(
  rootId: string,
  state: PendingAction,
  members: BranchWorkspaceMergeBackMemberPlan[],
  mode: 'merge' | 'pull-merge-push',
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    merge: typeof mergeRepositoryBranch
    push: typeof pushRepositoryBranch
  },
  refreshPlan: (signal: AbortSignal) => Promise<BranchWorkspaceGitActionPlanResult>,
  publishInvalidation: typeof publishWorkspaceInvalidation,
  active: Map<string, ActiveAction>,
): Promise<BranchWorkspaceGitActionResult> {
  if (state.plan.kind !== 'merge-back') return failureResult(state.plan, state.completed, 'error.invalid-arguments')
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (mode === 'merge' && member.mergeSatisfied) {
      state.completed.add(member.repositoryName)
      continue
    }
    if (signal.aborted) return failureResult(state.plan, state.completed, 'cancelled')
    updateActive(active.get(rootId), index + 1, state.completed.size)
    publishInvalidation(rootId)

    let progress = state.mergeProgress.get(member.repositoryName)
    let mergeSatisfied = member.mergeSatisfied
    if (mode === 'pull-merge-push' && !progress) {
      updateActive(active.get(rootId), index + 1, state.completed.size, member.repositoryName, 'pull')
      publishInvalidation(rootId)
      const pulled = await operations.pull(member.repoId, member.baseBranch, member.baseWorktreePath, signal)
      if (!pulled.ok) return actionFailure(state.plan, state.completed, member.repositoryName, 'pull', pulled)
      progress = 'pulled'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (progress === 'pulled') {
      const refreshed = await refreshPlan(signal)
      if (!refreshed.ok) {
        return actionFailure(state.plan, state.completed, member.repositoryName, 'merge', {
          ok: false,
          message: refreshed.message,
        })
      }
      const refreshedMember =
        refreshed.plan.kind === 'merge-back'
          ? refreshed.plan.members.find((candidate) => candidate.repositoryName === member.repositoryName)
          : undefined
      if (!refreshedMember || refreshedMember.targetHead !== member.targetHead) {
        return actionFailure(state.plan, state.completed, member.repositoryName, 'merge', {
          ok: false,
          message: 'workspace.branch-workspace.git-action.repository-changed',
        })
      }
      mergeSatisfied = refreshedMember.mergeSatisfied
    }
    if (progress !== 'merged' && !mergeSatisfied) {
      updateActive(active.get(rootId), index + 1, state.completed.size, member.repositoryName, 'merge')
      publishInvalidation(rootId)
      const merged = await operations.merge(member.repoId, member.baseWorktreePath, member.targetBranch, signal)
      if (!merged.ok) return actionFailure(state.plan, state.completed, member.repositoryName, 'merge', merged)
      progress = 'merged'
      state.mergeProgress.set(member.repositoryName, progress)
    }
    if (mode === 'pull-merge-push') {
      updateActive(active.get(rootId), index + 1, state.completed.size, member.repositoryName, 'push')
      publishInvalidation(rootId)
      const pushed = await operations.push(member.repoId, member.baseBranch, signal)
      if (!pushed.ok) return actionFailure(state.plan, state.completed, member.repositoryName, 'push', pushed)
    }
    state.mergeProgress.delete(member.repositoryName)
    state.completed.add(member.repositoryName)
    updateActive(active.get(rootId), index + 1, state.completed.size)
    publishInvalidation(rootId)
  }
  return successResult(state.plan, state.completed)
}

async function executeSync(
  rootId: string,
  state: PendingAction,
  kind: 'pull' | 'push',
  signal: AbortSignal,
  operations: {
    pull: typeof pullRepositoryBranch
    push: typeof pushRepositoryBranch
  },
  publishInvalidation: typeof publishWorkspaceInvalidation,
  active: Map<string, ActiveAction>,
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
  for (let index = 0; index < plan.members.length; index += 1) {
    const member = plan.members[index]!
    if (state.completed.has(member.repositoryName)) continue
    if (signal.aborted) return failureResult(plan, state.completed, 'cancelled')
    updateActive(active.get(rootId), index + 1, state.completed.size, member.repositoryName, kind)
    publishInvalidation(rootId)
    const result =
      kind === 'pull'
        ? await operations.pull(member.repoId, member.targetBranch, member.targetWorktreePath, signal)
        : await operations.push(member.repoId, member.targetBranch, signal)
    if (!result.ok) return actionFailure(plan, state.completed, member.repositoryName, kind, result)
    state.completed.add(member.repositoryName)
    updateActive(active.get(rootId), index + 1, state.completed.size)
    publishInvalidation(rootId)
  }
  return successResult(plan, state.completed)
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

function actionFailure(
  plan: BranchWorkspaceGitActionPlan,
  completed: ReadonlySet<string>,
  failedRepositoryName: string,
  step: BranchWorkspaceGitActionMemberResult['step'],
  result: ExecResult,
): BranchWorkspaceGitActionResult {
  return {
    ...failureResult(plan, completed, result.message),
    members: plan.members.map((member) => ({
      repositoryName: member.repositoryName,
      phase: completed.has(member.repositoryName)
        ? 'succeeded'
        : member.repositoryName === failedRepositoryName
          ? 'failed'
          : isInitiallySatisfied(plan, member.repositoryName)
            ? 'satisfied'
            : 'not-started',
      ...(member.repositoryName === failedRepositoryName
        ? { step, message: result.message, ...(result.reason ? { reason: result.reason } : {}) }
        : {}),
    })),
  }
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

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'workspace.branch-workspace.git-action.execute-failed'
}

function isInitiallySatisfied(plan: BranchWorkspaceGitActionPlan, repositoryName: string): boolean {
  if (plan.kind !== 'batch-commit') return false
  return plan.members.some((member) => member.repositoryName === repositoryName && !member.dirty)
}
