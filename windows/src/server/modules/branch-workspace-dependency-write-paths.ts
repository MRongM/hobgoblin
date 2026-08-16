import {
  buildBranchWorkspaceDependencyPlan,
  readBranchWorkspaceDependencyCandidates,
  type BranchWorkspaceDependencyPlanDependencies,
} from '#/server/modules/branch-workspace-dependency-plan.ts'
import {
  copyBranchWorkspaceEntry,
  materializeBranchWorkspaceSymlink,
  removeBranchWorkspaceEntry,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import type {
  BranchWorkspaceDependencyExecuteInput,
  BranchWorkspaceDependencyExecuteResult,
  BranchWorkspaceDependencyPlan,
  BranchWorkspaceDependencyPlanRequest,
  BranchWorkspaceDependencyPlanResult,
  BranchWorkspaceDependencyReadResult,
} from '#/shared/branch-workspace-dependencies.ts'

interface PendingBranchWorkspaceDependencyPlan {
  plan: BranchWorkspaceDependencyPlan
  request: BranchWorkspaceDependencyPlanRequest
}

export interface BranchWorkspaceDependencyWriteDependencies {
  buildPlan?: typeof buildBranchWorkspaceDependencyPlan
  readCandidates?: typeof readBranchWorkspaceDependencyCandidates
  planDependencies?: BranchWorkspaceDependencyPlanDependencies
  copyEntry?: typeof copyBranchWorkspaceEntry
  materializeSymlink?: typeof materializeBranchWorkspaceSymlink
  removeEntry?: typeof removeBranchWorkspaceEntry
  publishInvalidation?: typeof publishWorkspaceInvalidation
}

export interface BranchWorkspaceDependencyWriteService {
  read(rootId: string, branchWorkspaceId: string, signal?: AbortSignal): Promise<BranchWorkspaceDependencyReadResult>
  plan(
    rootId: string,
    request: BranchWorkspaceDependencyPlanRequest,
    signal?: AbortSignal,
  ): Promise<BranchWorkspaceDependencyPlanResult>
  execute(
    rootId: string,
    input: BranchWorkspaceDependencyExecuteInput,
  ): Promise<BranchWorkspaceDependencyExecuteResult>
  abort(rootId: string): boolean
  isActive(rootId: string): boolean
}

export function createBranchWorkspaceDependencyWriteService(
  dependencies: BranchWorkspaceDependencyWriteDependencies = {},
): BranchWorkspaceDependencyWriteService {
  const pendingByRoot = new Map<string, PendingBranchWorkspaceDependencyPlan>()
  const activeByRoot = new Map<string, AbortController>()
  const buildPlan = dependencies.buildPlan ?? buildBranchWorkspaceDependencyPlan
  const readCandidates = dependencies.readCandidates ?? readBranchWorkspaceDependencyCandidates
  const copyEntry = dependencies.copyEntry ?? copyBranchWorkspaceEntry
  const materializeSymlink = dependencies.materializeSymlink ?? materializeBranchWorkspaceSymlink
  const removeEntry = dependencies.removeEntry ?? removeBranchWorkspaceEntry
  const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceInvalidation

  return {
    async read(rootId, branchWorkspaceId, signal) {
      return await readCandidates(rootId, branchWorkspaceId, signal, dependencies.planDependencies)
    },

    async plan(rootId, request, signal) {
      if (activeByRoot.has(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.dependency.operation-in-progress' }
      }
      const result = await buildPlan(rootId, request, dependencies.planDependencies, signal)
      if (result.ok) pendingByRoot.set(rootId, { plan: result.plan, request })
      return result
    },

    async execute(rootId, input) {
      const pending = pendingByRoot.get(rootId)
      if (!pending || pending.plan.token !== input.planToken) {
        return { ok: false, message: 'workspace.branch-workspace.dependency.plan-stale', completedNames: [] }
      }
      const { plan } = pending
      if (activeByRoot.has(rootId)) {
        return failure(plan, 'workspace.branch-workspace.dependency.operation-in-progress', [])
      }
      const approvals = new Set(input.approvals)
      if (plan.requiredApprovals.some((approval) => !approvals.has(approval))) {
        return failure(plan, 'workspace.branch-workspace.dependency.approval-required', [])
      }

      const controller = new AbortController()
      activeByRoot.set(rootId, controller)
      const completedNames: string[] = []
      let changed = false
      try {
        const rebuilt = await buildPlan(
          rootId,
          pending.request,
          dependencies.planDependencies,
          controller.signal,
          plan,
        )
        if (!rebuilt.ok || rebuilt.plan.token !== plan.token) {
          return failure(plan, 'workspace.branch-workspace.dependency.plan-stale', completedNames)
        }

        if (plan.operation === 'add') {
          for (const entry of plan.entries) {
            controller.signal.throwIfAborted()
            if (entry.targetKind !== 'missing') {
              await removeEntry(rootId, entry.targetPath, controller.signal)
              changed = true
            }
            if (entry.mode === 'copy') {
              await copyEntry(rootId, entry.sourcePath, entry.targetPath, controller.signal)
            } else {
              await materializeSymlink(rootId, entry.sourcePath, entry.targetPath, controller.signal)
            }
            changed = true
            completedNames.push(entry.name)
          }
        } else {
          for (const entry of plan.entries) {
            controller.signal.throwIfAborted()
            await removeEntry(rootId, entry.targetPath, controller.signal)
            changed = true
            completedNames.push(entry.name)
          }
        }
        pendingByRoot.delete(rootId)
        if (changed) publishChange(publishInvalidation, rootId, input.sourceToken)
        return {
          ok: true,
          operation: plan.operation,
          branchWorkspaceId: plan.branchWorkspaceId,
          completedNames,
        }
      } catch (error) {
        if (changed) publishChange(publishInvalidation, rootId, input.sourceToken)
        return failure(plan, isAbortError(error) ? 'cancelled' : operationMessage(error), completedNames)
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

    isActive(rootId) {
      return activeByRoot.has(rootId)
    },
  }
}

function failure(
  plan: BranchWorkspaceDependencyPlan,
  message: string,
  completedNames: string[],
): BranchWorkspaceDependencyExecuteResult {
  return {
    ok: false,
    message,
    operation: plan.operation,
    branchWorkspaceId: plan.branchWorkspaceId,
    completedNames,
  }
}

function publishChange(
  publishInvalidation: typeof publishWorkspaceInvalidation,
  rootId: string,
  sourceToken?: string,
): void {
  if (sourceToken) publishInvalidation(rootId, sourceToken)
  else publishInvalidation(rootId)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function operationMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message || 'workspace.branch-workspace.dependency.execute-failed'
}
