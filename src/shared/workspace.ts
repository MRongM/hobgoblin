export interface WorkspaceRepositoryEntry {
  id: string
  name: string
}

export interface WorkspaceConfig {
  repo: string[]
}

export type WorkspaceConfigSnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; config: WorkspaceConfig }
  | { kind: 'invalid'; message: string }

export interface WorkspaceRepositoryCandidate extends WorkspaceRepositoryEntry {
  selected: boolean
  available: boolean
}

export interface WorkspaceDiscoveryIssue {
  path: string
  message: string
}

export type WorkspaceDiscoveryResult =
  | {
      ok: true
      rootId: string
      repositories: WorkspaceRepositoryEntry[]
      candidates: WorkspaceRepositoryCandidate[]
      configuration: WorkspaceConfigSnapshot
      skipped: WorkspaceDiscoveryIssue[]
    }
  | { ok: false; message: string }
