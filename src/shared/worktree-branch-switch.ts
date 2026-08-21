import { isSafeBranchName } from '#/shared/refnames.ts'
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'

export type WorktreeBranchSwitchTarget =
  | { kind: 'localBranch'; branch: string }
  | { kind: 'remoteBranch'; remoteRef: string; localBranch: string }

export function normalizeWorktreeBranchSwitchTarget(value: unknown): WorktreeBranchSwitchTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>

  if (input.kind === 'localBranch') {
    const branch = normalizedText(input.branch)
    return branch && isSafeBranchName(branch) ? { kind: 'localBranch', branch } : null
  }
  if (input.kind === 'remoteBranch') {
    const remoteRef = normalizedText(input.remoteRef)
    const localBranch = normalizedText(input.localBranch)
    return remoteRef && localBranch && isRemoteTrackingRef(remoteRef) && isSafeBranchName(localBranch)
      ? { kind: 'remoteBranch', remoteRef, localBranch }
      : null
  }
  return null
}

export function worktreeBranchSwitchTargetKey(target: WorktreeBranchSwitchTarget): string {
  return target.kind === 'localBranch' ? `local:${target.branch}` : `remote:${target.remoteRef}`
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
