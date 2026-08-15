import type { BranchWorkspaceApproval } from '#/shared/branch-workspaces.ts'
import type { WorkspaceDiscoveryResult } from '#/shared/workspace.ts'

export type WorkspaceRecoveryCleanupScope = 'project' | 'registry-repair' | 'registry-reset'

export interface WorkspaceRecoveryBranchPlan {
  id: string
  branch: string
  path: string
  mode: 'remove' | 'record-only'
  requiredApprovals: BranchWorkspaceApproval[]
  message?: string
}

export interface WorkspaceRecoveryPlan {
  token: string
  rootId: string
  cleanupScope: WorkspaceRecoveryCleanupScope
  branchWorkspaces: WorkspaceRecoveryBranchPlan[]
  configuredRepositoryNames: string[]
  discoveredRepositoryNames: string[]
}

export type WorkspaceRecoveryPlanResult = { ok: true; plan: WorkspaceRecoveryPlan } | { ok: false; message: string }

export interface WorkspaceRecoveryExecuteInput {
  planToken: string
  sourceToken?: string
}

export type WorkspaceRecoveryExecuteInputResult =
  | { ok: true; input: WorkspaceRecoveryExecuteInput }
  | { ok: false; message: string }

export interface WorkspaceRecoveryBranchOutcome {
  id: string
  branch: string
  outcome: 'removed' | 'record-removed'
  message?: string
}

export type WorkspaceRecoveryExecuteResult =
  | {
      ok: true
      outcome: 'completed' | 'completed-with-residuals'
      workspace: Extract<WorkspaceDiscoveryResult, { ok: true }>
      branches: WorkspaceRecoveryBranchOutcome[]
    }
  | { ok: false; message: string; cancelled?: boolean }

export function normalizeWorkspaceRecoveryExecuteInput(value: unknown): WorkspaceRecoveryExecuteInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidInput()
  const input = value as Record<string, unknown>
  const planToken = typeof input.planToken === 'string' ? input.planToken.trim() : ''
  if (!/^sha256:[a-f0-9]{64}$/.test(planToken)) return invalidInput()

  if (input.sourceToken === undefined) return { ok: true, input: { planToken } }
  if (typeof input.sourceToken !== 'string') return invalidInput()
  const sourceToken = input.sourceToken.trim()
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceToken)) return invalidInput()
  return { ok: true, input: { planToken, sourceToken } }
}

function invalidInput(): WorkspaceRecoveryExecuteInputResult {
  return { ok: false, message: 'error.invalid-arguments' }
}
