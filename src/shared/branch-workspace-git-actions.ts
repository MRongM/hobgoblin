import type { GitFailureReason } from '#/shared/git-types.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

export type BranchWorkspaceGitActionKind = 'batch-commit' | 'merge-back' | 'pull' | 'push'
export type BranchWorkspaceMergeMode = 'merge' | 'pull-merge-push'
export type BranchWorkspaceGitActionStep = 'commit' | 'pull' | 'merge' | 'push'
export type BranchWorkspaceGitActionMemberPhase = 'ready' | 'satisfied' | 'succeeded' | 'failed' | 'not-started'

export interface BranchWorkspaceBatchCommitMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  dirty: boolean
  changeCount: number
  fingerprint: string
}

export interface BranchWorkspaceMergeBackMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  targetHead: string
  baseBranch: string
  baseWorktreePath: string
  baseHead: string
  mergeSatisfied: boolean
  pullMergePushReady: boolean
  pullMergePushMessage?: string
  fingerprint: string
}

export interface BranchWorkspaceSyncMemberPlan {
  repositoryName: string
  repoId: string
  targetBranch: string
  targetWorktreePath: string
  targetHead: string
  ready: boolean
  message?: string
  fingerprint: string
}

interface BranchWorkspaceGitActionPlanBase {
  token: string
  rootId: string
  branchWorkspaceId: string
}

export interface BranchWorkspaceBatchCommitPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'batch-commit'
  members: BranchWorkspaceBatchCommitMemberPlan[]
}

export interface BranchWorkspaceMergeBackPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'merge-back'
  members: BranchWorkspaceMergeBackMemberPlan[]
  pullMergePushReady: boolean
}

export interface BranchWorkspaceSyncPlan extends BranchWorkspaceGitActionPlanBase {
  kind: 'pull' | 'push'
  members: BranchWorkspaceSyncMemberPlan[]
  ready: boolean
}

export type BranchWorkspaceGitActionPlan =
  | BranchWorkspaceBatchCommitPlan
  | BranchWorkspaceMergeBackPlan
  | BranchWorkspaceSyncPlan

export type BranchWorkspaceGitActionPlanResult =
  | { ok: true; plan: BranchWorkspaceGitActionPlan }
  | { ok: false; message: string; repositoryName?: string }

export interface BranchWorkspaceGitActionPlanRequest {
  kind: BranchWorkspaceGitActionKind
  branchWorkspaceId: string
}

export type BranchWorkspaceGitActionPlanRequestResult =
  | { ok: true; request: BranchWorkspaceGitActionPlanRequest }
  | { ok: false; message: string }

export interface BranchWorkspaceCommitMessageInput {
  repositoryName: string
  message: string
}

export type BranchWorkspaceGitActionExecuteInput =
  | {
      kind: 'batch-commit'
      planToken: string
      messages: BranchWorkspaceCommitMessageInput[]
    }
  | {
      kind: 'merge-back'
      planToken: string
      mode: BranchWorkspaceMergeMode
    }
  | {
      kind: 'pull' | 'push'
      planToken: string
    }

export type BranchWorkspaceGitActionExecuteInputResult =
  | { ok: true; input: BranchWorkspaceGitActionExecuteInput }
  | { ok: false; message: string }

export interface BranchWorkspaceGitActionMemberResult {
  repositoryName: string
  phase: BranchWorkspaceGitActionMemberPhase
  step?: BranchWorkspaceGitActionStep
  message?: string
  reason?: GitFailureReason
}

export interface BranchWorkspaceGitActionResult {
  ok: boolean
  kind: BranchWorkspaceGitActionKind
  planToken: string
  branchWorkspaceId: string
  members: BranchWorkspaceGitActionMemberResult[]
  message?: string
}

export function normalizeBranchWorkspaceGitActionPlanRequest(
  value: unknown,
): BranchWorkspaceGitActionPlanRequestResult {
  const input = asRecord(value)
  const branchWorkspaceId = normalizedText(input?.branchWorkspaceId)
  if (
    !branchWorkspaceId ||
    (input?.kind !== 'batch-commit' && input?.kind !== 'merge-back' && input?.kind !== 'pull' && input?.kind !== 'push')
  ) {
    return invalidArguments()
  }
  return { ok: true, request: { kind: input.kind, branchWorkspaceId } }
}

export function normalizeBranchWorkspaceGitActionExecuteInput(
  value: unknown,
): BranchWorkspaceGitActionExecuteInputResult {
  const input = asRecord(value)
  const planToken = normalizedText(input?.planToken)
  if (!planToken) return invalidArguments()

  if (input?.kind === 'merge-back') {
    if (input.mode !== 'merge' && input.mode !== 'pull-merge-push') return invalidArguments()
    return { ok: true, input: { kind: 'merge-back', planToken, mode: input.mode } }
  }
  if (input?.kind === 'pull' || input?.kind === 'push') {
    return { ok: true, input: { kind: input.kind, planToken } }
  }
  if (input?.kind !== 'batch-commit' || !Array.isArray(input.messages)) return invalidArguments()

  const repositoryNames = new Set<string>()
  const messages: BranchWorkspaceCommitMessageInput[] = []
  for (const value of input.messages) {
    const candidate = asRecord(value)
    const repositoryName = normalizedText(candidate?.repositoryName)
    const message = normalizedMessage(candidate?.message)
    if (
      !repositoryName ||
      !isWorkspaceRepositoryName(repositoryName) ||
      !message ||
      repositoryNames.has(repositoryName)
    ) {
      return invalidArguments()
    }
    repositoryNames.add(repositoryName)
    messages.push({ repositoryName, message })
  }
  return { ok: true, input: { kind: 'batch-commit', planToken, messages } }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !text.includes('\0') && !/[\x00-\x1f\x7f]/.test(text) ? text : null
}

function normalizedMessage(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null
  const message = value.trim()
  return message ? message : null
}

function invalidArguments(): { ok: false; message: string } {
  return { ok: false, message: 'error.invalid-arguments' }
}
