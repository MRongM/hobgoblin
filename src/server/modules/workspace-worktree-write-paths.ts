import {
  buildWorkspaceWorktreePlan,
  validateWorkspaceWorktreeRetryPlan,
} from '#/server/modules/workspace-worktree-plan.ts'
import {
  createRepositoryWorktree,
  pullRepositoryBranch,
  removeRepositoryWorktree,
} from '#/server/modules/repo-write-paths.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import type {
  WorkspaceWorktreeBatchMemberResult,
  WorkspaceWorktreeBatchResult,
  WorkspaceWorktreePlan,
  WorkspaceWorktreePlanRequest,
  WorkspaceWorktreePlanResult,
} from '#/shared/workspace-worktrees.ts'

interface ExecuteWorkspaceWorktreeInput {
  planToken: string
  approveBootstrap: boolean
}

interface PendingWorkspacePlan {
  plan: WorkspaceWorktreePlan
  request: WorkspaceWorktreePlanRequest
  completed: Set<string>
}

interface WorkspaceWorktreeServiceDependencies {
  buildPlan?: typeof buildWorkspaceWorktreePlan
  createWorktree?: typeof createRepositoryWorktree
  removeWorktree?: typeof removeRepositoryWorktree
  pullBranch?: typeof pullRepositoryBranch
  validateRetry?: typeof validateWorkspaceWorktreeRetryPlan
}

export interface WorkspaceWorktreeService {
  plan: (rootId: string, request: WorkspaceWorktreePlanRequest) => Promise<WorkspaceWorktreePlanResult>
  execute: (rootId: string, input: ExecuteWorkspaceWorktreeInput) => Promise<WorkspaceWorktreeBatchResult>
  abort: (rootId: string) => boolean
}

export function createWorkspaceWorktreeService(
  dependencies: WorkspaceWorktreeServiceDependencies = {},
): WorkspaceWorktreeService {
  const pendingByRoot = new Map<string, PendingWorkspacePlan>()
  const activeByRoot = new Map<string, AbortController>()
  const buildPlan = dependencies.buildPlan ?? buildWorkspaceWorktreePlan
  const createWorktree = dependencies.createWorktree ?? createRepositoryWorktree
  const removeWorktree = dependencies.removeWorktree ?? removeRepositoryWorktree
  const pullBranch = dependencies.pullBranch ?? pullRepositoryBranch
  const validateRetry = dependencies.validateRetry ?? validateWorkspaceWorktreeRetryPlan

  return {
    async plan(rootId, request) {
      const result = await buildPlan(rootId, request)
      if (result.ok) {
        pendingByRoot.set(rootId, { plan: result.plan, request, completed: new Set() })
      }
      return result
    },

    async execute(rootId, input) {
      const pending = pendingByRoot.get(rootId)
      if (!pending || pending.plan.token !== input.planToken) {
        return failedBatch(pending?.plan, input.planToken, 'workspace.worktree.plan-stale')
      }
      if (activeByRoot.has(rootId)) {
        return failedBatch(pending.plan, input.planToken, 'workspace.worktree.operation-in-progress')
      }
      if (
        !input.approveBootstrap &&
        pending.plan.members.some((member) => member.confirmationRequired && !pending.completed.has(member.repoId))
      ) {
        return failedBatch(pending.plan, input.planToken, 'workspace.worktree.bootstrap-confirmation-required')
      }

      const controller = new AbortController()
      activeByRoot.set(rootId, controller)
      try {
        if (pending.completed.size === 0) {
          const current = await buildPlan(rootId, pending.request, {}, controller.signal)
          if (!current.ok || current.plan.token !== pending.plan.token) {
            return failedBatch(pending.plan, input.planToken, 'workspace.worktree.plan-stale')
          }
        } else {
          const current = await validateRetry(pending.plan, pending.completed, {}, controller.signal)
          if (!current.ok) return failedBatch(pending.plan, input.planToken, current.message)
        }

        const members: WorkspaceWorktreeBatchMemberResult[] = pending.plan.members.map((member) => ({
          repoId: member.repoId,
          phase: pending.completed.has(member.repoId) ? 'satisfied' : 'not-started',
        }))
        for (let index = 0; index < pending.plan.members.length; index += 1) {
          const member = pending.plan.members[index]!
          if (pending.completed.has(member.repoId)) continue
          if (controller.signal.aborted) {
            members[index] = { repoId: member.repoId, phase: 'failed', message: 'cancelled' }
            return batchResult(pending.plan, members, false, 'cancelled')
          }
          let result: ExecResult
          if (pending.plan.operation === 'create') {
            result = await createWorktree(
              member.repoId,
              {
                worktreePath: member.worktreePath,
                mode: { kind: 'newBranch', newBranch: member.branch, baseRef: member.baseRef! },
              },
              member.worktreeBootstrap ?? { kind: 'skip' },
              controller.signal,
            )
          } else if (pending.plan.operation === 'remove') {
            const removalOptions = pending.plan.removalOptions ?? {
              alsoDeleteBranch: false,
              alsoDeleteUpstream: false,
            }
            result = await removeWorktree(
              member.repoId,
              {
                branch: member.branch,
                worktreePath: member.worktreePath,
                alsoDeleteBranch: removalOptions.alsoDeleteBranch,
                alsoDeleteUpstream: removalOptions.alsoDeleteUpstream,
              },
              controller.signal,
            )
          } else {
            result = await pullBranch(member.repoId, member.branch, member.worktreePath, controller.signal)
          }
          if (!result.ok) {
            members[index] = { repoId: member.repoId, phase: 'failed', message: result.message }
            return batchResult(pending.plan, members, false, result.message)
          }
          pending.completed.add(member.repoId)
          members[index] = { repoId: member.repoId, phase: 'succeeded', message: result.message }
        }

        pendingByRoot.delete(rootId)
        return batchResult(pending.plan, members, true)
      } finally {
        if (activeByRoot.get(rootId) === controller) activeByRoot.delete(rootId)
      }
    },

    abort(rootId) {
      const controller = activeByRoot.get(rootId)
      if (!controller) return false
      controller.abort()
      return true
    },
  }
}

function failedBatch(
  plan: WorkspaceWorktreePlan | undefined,
  planToken: string,
  message: string,
): WorkspaceWorktreeBatchResult {
  return {
    ok: false,
    planToken,
    operation: plan?.operation ?? 'create',
    branch: plan?.branch ?? '',
    members: plan?.members.map((member) => ({ repoId: member.repoId, phase: 'not-started' })) ?? [],
    message,
  }
}

function batchResult(
  plan: WorkspaceWorktreePlan,
  members: WorkspaceWorktreeBatchMemberResult[],
  ok: boolean,
  message?: string,
): WorkspaceWorktreeBatchResult {
  return {
    ok,
    planToken: plan.token,
    operation: plan.operation,
    branch: plan.branch,
    members,
    ...(message ? { message } : {}),
  }
}

const workspaceWorktreeService = createWorkspaceWorktreeService()

export async function planWorkspaceWorktree(
  rootId: string,
  request: WorkspaceWorktreePlanRequest,
): Promise<WorkspaceWorktreePlanResult> {
  return await workspaceWorktreeService.plan(rootId, request)
}

export async function executeWorkspaceWorktree(
  rootId: string,
  input: ExecuteWorkspaceWorktreeInput,
): Promise<WorkspaceWorktreeBatchResult> {
  return await workspaceWorktreeService.execute(rootId, input)
}

export function abortWorkspaceWorktree(rootId: string): boolean {
  return workspaceWorktreeService.abort(rootId)
}
