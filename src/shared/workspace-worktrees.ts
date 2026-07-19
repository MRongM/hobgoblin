import type { WorktreeBootstrapDecision, WorktreeBootstrapPreview } from '#/shared/worktree-bootstrap-summary.ts'

export type WorkspaceWorktreePlanRequest =
  | { operation: 'create'; branch: string; baseBranch: string }
  | {
      operation: 'remove'
      branch: string
      alsoDeleteBranch: boolean
      alsoDeleteUpstream: boolean
    }
  | { operation: 'pull' }

export interface WorkspaceWorktreeRemovalOptions {
  alsoDeleteBranch: boolean
  alsoDeleteUpstream: boolean
}

export interface WorkspaceWorktreeMemberPlan {
  repoId: string
  branch: string
  worktreePath: string
  baseRef?: string
  upstream?: string
  worktreeBootstrap?: WorktreeBootstrapDecision
  bootstrapPreview?: WorktreeBootstrapPreview
  confirmationRequired?: boolean
  dirty?: boolean
  locked?: boolean
}

export interface WorkspaceWorktreePlan {
  token: string
  rootId: string
  operation: WorkspaceWorktreePlanRequest['operation']
  branch: string
  removalOptions?: WorkspaceWorktreeRemovalOptions
  members: WorkspaceWorktreeMemberPlan[]
}

export type WorkspaceWorktreePlanResult = { ok: true; plan: WorkspaceWorktreePlan } | { ok: false; message: string }

export type WorkspaceWorktreeBatchMemberPhase = 'satisfied' | 'succeeded' | 'failed' | 'not-started'

export interface WorkspaceWorktreeBatchMemberResult {
  repoId: string
  phase: WorkspaceWorktreeBatchMemberPhase
  message?: string
}

export interface WorkspaceWorktreeBatchResult {
  ok: boolean
  planToken: string
  operation: WorkspaceWorktreePlanRequest['operation']
  branch: string
  members: WorkspaceWorktreeBatchMemberResult[]
  message?: string
}
