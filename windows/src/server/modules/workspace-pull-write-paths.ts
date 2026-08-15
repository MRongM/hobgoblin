import {
  buildWorkspacePullPlan,
  validateWorkspacePullRetryPlan,
} from '#/server/modules/workspace-pull-plan.ts'
import { pullRepositoryBranch } from '#/server/modules/repo-write-paths.ts'
import type {
  WorkspacePullExecuteInput,
  WorkspacePullMemberResult,
  WorkspacePullPlan,
  WorkspacePullPlanResult,
  WorkspacePullResult,
} from '#/shared/workspace-pull.ts'

interface PendingWorkspacePull {
  plan: WorkspacePullPlan
  completed: Set<string>
}

interface WorkspacePullServiceDependencies {
  buildPlan?: typeof buildWorkspacePullPlan
  validateRetry?: typeof validateWorkspacePullRetryPlan
  pullBranch?: typeof pullRepositoryBranch
}

export interface WorkspacePullService {
  plan(rootId: string): Promise<WorkspacePullPlanResult>
  execute(rootId: string, input: WorkspacePullExecuteInput): Promise<WorkspacePullResult>
  abort(rootId: string): boolean
}

export function createWorkspacePullService(
  dependencies: WorkspacePullServiceDependencies = {},
): WorkspacePullService {
  const pendingByRoot = new Map<string, PendingWorkspacePull>()
  const activeByRoot = new Map<string, AbortController>()
  const buildPlan = dependencies.buildPlan ?? buildWorkspacePullPlan
  const validateRetry = dependencies.validateRetry ?? validateWorkspacePullRetryPlan
  const pullBranch = dependencies.pullBranch ?? pullRepositoryBranch

  return {
    async plan(rootId) {
      const result = await buildPlan(rootId)
      if (result.ok) pendingByRoot.set(rootId, { plan: result.plan, completed: new Set() })
      return result
    },

    async execute(rootId, input) {
      const pending = pendingByRoot.get(rootId)
      if (!pending || pending.plan.token !== input.planToken) {
        return failedResult(pending?.plan, input.planToken, 'workspace.pull.plan-stale')
      }
      if (activeByRoot.has(rootId)) {
        return failedResult(pending.plan, input.planToken, 'workspace.pull.operation-in-progress')
      }
      const controller = new AbortController()
      activeByRoot.set(rootId, controller)
      try {
        if (pending.completed.size === 0) {
          const current = await buildPlan(rootId, {}, controller.signal)
          if (!current.ok || current.plan.token !== pending.plan.token) {
            return failedResult(
              pending.plan,
              input.planToken,
              !current.ok && current.message === 'error.ssh-config-changed'
                ? current.message
                : 'workspace.pull.plan-stale',
            )
          }
        } else {
          const current = await validateRetry(pending.plan, pending.completed, {}, controller.signal)
          if (!current.ok) return failedResult(pending.plan, input.planToken, current.message)
        }

        const members: WorkspacePullMemberResult[] = pending.plan.members.map((member) => ({
          repoId: member.repoId,
          phase: pending.completed.has(member.repoId) ? 'satisfied' : 'not-started',
        }))
        for (let index = 0; index < pending.plan.members.length; index += 1) {
          const member = pending.plan.members[index]!
          if (pending.completed.has(member.repoId)) continue
          if (controller.signal.aborted) {
            members[index] = { repoId: member.repoId, phase: 'failed', message: 'cancelled' }
            return resultFrom(pending.plan, members, false, 'cancelled')
          }
          const result = await pullBranch(
            member.repoId,
            member.branch,
            member.worktreePath,
            controller.signal,
          )
          if (!result.ok) {
            members[index] = { repoId: member.repoId, phase: 'failed', message: result.message }
            return resultFrom(pending.plan, members, false, result.message)
          }
          pending.completed.add(member.repoId)
          members[index] = { repoId: member.repoId, phase: 'succeeded', message: result.message }
        }
        pendingByRoot.delete(rootId)
        return resultFrom(pending.plan, members, true)
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

function failedResult(
  plan: WorkspacePullPlan | undefined,
  planToken: string,
  message: string,
): WorkspacePullResult {
  return {
    ok: false,
    planToken,
    members: plan?.members.map((member) => ({ repoId: member.repoId, phase: 'not-started' })) ?? [],
    message,
  }
}

function resultFrom(
  plan: WorkspacePullPlan,
  members: WorkspacePullMemberResult[],
  ok: boolean,
  message?: string,
): WorkspacePullResult {
  return { ok, planToken: plan.token, members, ...(message ? { message } : {}) }
}

const workspacePullService = createWorkspacePullService()

export async function planWorkspacePull(rootId: string): Promise<WorkspacePullPlanResult> {
  return await workspacePullService.plan(rootId)
}

export async function executeWorkspacePull(
  rootId: string,
  input: WorkspacePullExecuteInput,
): Promise<WorkspacePullResult> {
  return await workspacePullService.execute(rootId, input)
}

export function abortWorkspacePull(rootId: string): boolean {
  return workspacePullService.abort(rootId)
}
