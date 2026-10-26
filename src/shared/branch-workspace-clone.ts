/** Working-copy transport is bounded independently of ordinary clipboard transfers. */
export const WORKSPACE_SNAPSHOT_CHUNK_BYTES = 256 * 1024
export const WORKSPACE_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024 * 1024
export const WORKSPACE_SNAPSHOT_MAX_ENTRIES = 12_000

export interface WorkspaceSnapshotArtifact {
  id: string
  size: number
  sha256: string
}

export interface WorkspaceSnapshotEntry {
  path: string
  kind: 'file' | 'directory' | 'symlink'
  mode: number
  size: number
  sha256?: string
  linkTarget?: string
  artifact?: WorkspaceSnapshotArtifact
}

export interface WorkspaceSnapshotRepository {
  head: string
  branch: string | null
  objectFormat: 'sha1' | 'sha256'
  config: Array<{ key: string; value: string }>
  stagedSha256: string
  unstagedSha256: string
  indexSha256: string
  trackedPaths: string[]
}

export interface WorkspaceSnapshotInspection {
  fingerprint: string
  repository?: WorkspaceSnapshotRepository
  entries: WorkspaceSnapshotEntry[]
  ignoredPaths: string[]
  totalBytes: number
}

export interface WorkspaceSnapshotExport extends WorkspaceSnapshotInspection {
  operationId: string
  bundle?: WorkspaceSnapshotArtifact
  staged?: WorkspaceSnapshotArtifact
  unstaged?: WorkspaceSnapshotArtifact
}

export interface BranchWorkspaceCloneRequest {
  sourceRootId: string
  sourceBranchWorkspaceId: string
  targetRootId: string
  parentDirectory?: string
  directoryName: string
  /** Member name to explicitly selected ignored, relative paths. */
  ignoredPaths?: Record<string, string[]>
  mappings?: Record<string, { repositoryId: string; branchName: string }>
}

export interface BranchWorkspaceCloneMemberPlan {
  repositoryName: string
  sourcePath: string
  targetPath: string
  snapshot: WorkspaceSnapshotInspection
  mapping?: { repositoryId: string; branchName: string; commonDirectory: string }
}

export interface BranchWorkspaceClonePlan {
  token: string
  sourceRootId: string
  sourceBranchWorkspaceId: string
  sourcePath: string
  targetRootId: string
  parentDirectory?: string
  directoryName: string
  path: string
  branchWorkspaceId: string
  members: BranchWorkspaceCloneMemberPlan[]
  /** Null when the registered folder itself is the sole Git member. */
  rootSnapshot: WorkspaceSnapshotInspection | null
  ignoredPaths: Record<string, string[]>
}

export interface BranchWorkspaceCloneProgress {
  planToken: string
  branchWorkspaceId: string
  phase: 'export' | 'transfer' | 'restore' | 'complete' | 'failed' | 'cancelled'
  repositoryName?: string
  completedRepositoryNames: string[]
  transferredBytes: number
  detail?: string
}

export type BranchWorkspaceClonePlanResult =
  | { ok: true; plan: BranchWorkspaceClonePlan }
  | { ok: false; message: string; detail?: string }

export type BranchWorkspaceCloneExecuteResult =
  | { ok: true; rootId: string; branchWorkspaceId: string }
  | { ok: false; message: string; detail?: string; branchWorkspaceId?: string }

export function isWorkspaceSnapshotRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length < 4096 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
  )
}
