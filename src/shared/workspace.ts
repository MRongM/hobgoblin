import type { RemoteRepoRef } from '#/shared/remote-repo.ts'

export interface WorkspaceRepositoryEntry {
  id: string
  name: string
  remoteRef?: RemoteRepoRef
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

export function isWorkspaceRepositoryName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  )
}
