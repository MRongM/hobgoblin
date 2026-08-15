export interface WorkspacePullMemberPlan {
  repoId: string
  branch: string
  worktreePath: string
}

export interface WorkspacePullPlan {
  token: string
  rootId: string
  members: WorkspacePullMemberPlan[]
}

export type WorkspacePullPlanResult =
  | { ok: true; plan: WorkspacePullPlan }
  | { ok: false; message: string }

export type WorkspacePullMemberPhase = 'satisfied' | 'succeeded' | 'failed' | 'not-started'

export interface WorkspacePullMemberResult {
  repoId: string
  phase: WorkspacePullMemberPhase
  message?: string
}

export interface WorkspacePullResult {
  ok: boolean
  planToken: string
  members: WorkspacePullMemberResult[]
  message?: string
}

export interface WorkspacePullExecuteInput {
  planToken: string
}
