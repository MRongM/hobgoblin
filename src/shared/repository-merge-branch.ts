import { isSafeBranchName } from '#/shared/refnames.ts'
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'

export type RepositoryMergeBranchSelection =
  | { kind: 'local'; branch: string }
  | { kind: 'remote'; remoteRef: string }

export function normalizeRepositoryMergeBranchSelection(value: unknown): RepositoryMergeBranchSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (input.kind === 'local') {
    const branch = normalizedText(input.branch)
    return branch && isSafeBranchName(branch) ? { kind: 'local', branch } : null
  }
  if (input.kind === 'remote') {
    const remoteRef = normalizedText(input.remoteRef)
    return remoteRef && isRemoteTrackingRef(remoteRef) ? { kind: 'remote', remoteRef } : null
  }
  return null
}

export function repositoryMergeBranchSelectionKey(selection: RepositoryMergeBranchSelection): string {
  return selection.kind === 'local' ? `local:${selection.branch}` : `remote:${selection.remoteRef}`
}

export function repositoryMergeBranchDisplayName(selection: RepositoryMergeBranchSelection): string {
  return selection.kind === 'local' ? selection.branch : selection.remoteRef
}

export function repositoryMergeBranchFullRef(selection: RepositoryMergeBranchSelection): string {
  return selection.kind === 'local' ? `refs/heads/${selection.branch}` : `refs/remotes/${selection.remoteRef}`
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}
