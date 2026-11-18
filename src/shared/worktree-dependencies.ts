import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'

export interface WorktreeDependencyTarget {
  repoId: string
  worktreePath: string
}

export interface WorktreeDependencyReadInput extends WorktreeDependencyTarget {
  operation: 'add' | 'remove'
  sourceWorktreePath?: string
}

export interface WorktreeDependencyCandidate {
  path: string
  kind: 'file' | 'directory' | 'symlink'
  targetPath: string
  targetExists: boolean
}

export type WorktreeDependencyReadResult =
  | { ok: true; sourceWorktreePath: string; candidates: WorktreeDependencyCandidate[] }
  | { ok: false; message: string }

export type WorktreeDependencyPlanRequest = WorktreeDependencyTarget &
  (
    | { operation: 'add'; sourceWorktreePath: string; entries: WorktreeBootstrapSelection[] }
    | { operation: 'remove'; paths: string[] }
  )

export interface WorktreeDependencyPlanEntry {
  path: string
  targetPath: string
  sourcePath?: string
  kind: 'file' | 'directory' | 'symlink'
  mode?: 'copy' | 'symlink'
}

export interface WorktreeDependencyPlan {
  token: string
  operation: 'add' | 'remove'
  worktreePath: string
  entries: WorktreeDependencyPlanEntry[]
}

export type WorktreeDependencyPlanResult = { ok: true; plan: WorktreeDependencyPlan } | { ok: false; message: string }

export type WorktreeDependencyExecuteResult =
  | { ok: true; completedPaths: string[] }
  | { ok: false; message: string; completedPaths: string[] }
