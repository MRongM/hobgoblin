import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'
import type { BranchWorkspaceAuxiliaryMode, BranchWorkspacePathKind } from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceDependencyOperation = 'add' | 'remove'
export type BranchWorkspaceDependencyApproval = 'outside-root-source'

export interface BranchWorkspaceDependencyCandidate {
  name: string
  sourcePath: string
  sourceKind: Exclude<BranchWorkspacePathKind, 'missing'>
  targetPath: string
  targetKind: BranchWorkspacePathKind
  outsideRoot: boolean
}

export type BranchWorkspaceDependencyReadResult =
  | {
      ok: true
      rootId: string
      branchWorkspaceId: string
      candidates: BranchWorkspaceDependencyCandidate[]
    }
  | { ok: false; message: string }

export interface BranchWorkspaceDependencyAddSelection {
  name: string
  mode: BranchWorkspaceAuxiliaryMode
}

export type BranchWorkspaceDependencyPlanRequest =
  | {
      operation: 'add'
      branchWorkspaceId: string
      entries: BranchWorkspaceDependencyAddSelection[]
    }
  | {
      operation: 'remove'
      branchWorkspaceId: string
      names: string[]
    }

export type BranchWorkspaceDependencyPlanRequestResult =
  | { ok: true; request: BranchWorkspaceDependencyPlanRequest }
  | { ok: false; message: string }

interface BranchWorkspaceDependencyPlanBase {
  token: string
  rootId: string
  branchWorkspaceId: string
  requiredApprovals: BranchWorkspaceDependencyApproval[]
}

export interface BranchWorkspaceDependencyAddPlanEntry {
  name: string
  mode: BranchWorkspaceAuxiliaryMode
  sourcePath: string
  sourceKind: Exclude<BranchWorkspacePathKind, 'missing'>
  targetPath: string
  outsideRoot: boolean
}

export interface BranchWorkspaceDependencyRemovePlanEntry {
  name: string
  sourcePath: string
  targetPath: string
  targetKind: Exclude<BranchWorkspacePathKind, 'missing'>
  fingerprint: string
}

export interface BranchWorkspaceDependencyAddPlan extends BranchWorkspaceDependencyPlanBase {
  operation: 'add'
  entries: BranchWorkspaceDependencyAddPlanEntry[]
}

export interface BranchWorkspaceDependencyRemovePlan extends BranchWorkspaceDependencyPlanBase {
  operation: 'remove'
  entries: BranchWorkspaceDependencyRemovePlanEntry[]
}

export type BranchWorkspaceDependencyPlan =
  | BranchWorkspaceDependencyAddPlan
  | BranchWorkspaceDependencyRemovePlan

export type BranchWorkspaceDependencyPlanResult =
  | { ok: true; plan: BranchWorkspaceDependencyPlan }
  | { ok: false; message: string }

export interface BranchWorkspaceDependencyExecuteInput {
  planToken: string
  approvals: BranchWorkspaceDependencyApproval[]
  sourceToken?: string
}

export type BranchWorkspaceDependencyExecuteInputResult =
  | { ok: true; input: BranchWorkspaceDependencyExecuteInput }
  | { ok: false; message: string }

export type BranchWorkspaceDependencyExecuteResult =
  | {
      ok: true
      operation: BranchWorkspaceDependencyOperation
      branchWorkspaceId: string
      completedNames: string[]
    }
  | {
      ok: false
      message: string
      operation?: BranchWorkspaceDependencyOperation
      branchWorkspaceId?: string
      completedNames?: string[]
    }

export function normalizeBranchWorkspaceDependencyPlanRequest(
  value: unknown,
): BranchWorkspaceDependencyPlanRequestResult {
  const input = asRecord(value)
  const branchWorkspaceId = normalizedText(input?.branchWorkspaceId)
  if (!branchWorkspaceId) return invalidArguments()

  if (input?.operation === 'add') {
    if (!Array.isArray(input.entries) || input.entries.length === 0) return invalidArguments()
    const names = new Set<string>()
    const entries: BranchWorkspaceDependencyAddSelection[] = []
    for (const value of input.entries) {
      const entry = asRecord(value)
      const name = dependencyName(entry?.name)
      if (!name || names.has(name) || (entry?.mode !== 'copy' && entry?.mode !== 'symlink')) {
        return invalidArguments()
      }
      names.add(name)
      entries.push({ name, mode: entry.mode })
    }
    return { ok: true, request: { operation: 'add', branchWorkspaceId, entries } }
  }

  if (input?.operation === 'remove') {
    if (!Array.isArray(input.names) || input.names.length === 0) return invalidArguments()
    const names: string[] = []
    const seen = new Set<string>()
    for (const value of input.names) {
      const name = dependencyName(value)
      if (!name || seen.has(name)) return invalidArguments()
      seen.add(name)
      names.push(name)
    }
    return { ok: true, request: { operation: 'remove', branchWorkspaceId, names } }
  }

  return invalidArguments()
}

export function normalizeBranchWorkspaceDependencyExecuteInput(
  value: unknown,
): BranchWorkspaceDependencyExecuteInputResult {
  const input = asRecord(value)
  const planToken = normalizedText(input?.planToken)
  if (!planToken || !Array.isArray(input?.approvals)) return invalidArguments()
  const approvals: BranchWorkspaceDependencyApproval[] = []
  for (const approval of input.approvals) {
    if (approval !== 'outside-root-source') return invalidArguments()
    if (!approvals.includes(approval)) approvals.push(approval)
  }
  const sourceToken = input.sourceToken === undefined ? undefined : normalizedSourceToken(input.sourceToken)
  if (input.sourceToken !== undefined && !sourceToken) return invalidArguments()
  return {
    ok: true,
    input: {
      planToken,
      approvals,
      ...(sourceToken ? { sourceToken } : {}),
    },
  }
}

function dependencyName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return isWorkspaceRepositoryName(name) ? name : null
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !text.includes('\0') && !/[\x00-\x1f\x7f]/.test(text) ? text : null
}

function normalizedSourceToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const token = value.trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function invalidArguments(): { ok: false; message: string } {
  return { ok: false, message: 'error.invalid-arguments' }
}
