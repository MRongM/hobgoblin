import { validateBranchName } from '#/shared/refnames.ts'
import { deriveLocalBranchFromRemoteRef } from '#/shared/worktree-create.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

export type BranchNameValidationKey =
  | 'action.create-branch-name-required'
  | 'action.create-worktree-branch-invalid'
  | 'action.create-worktree-branch-exists'

export interface RemoteTrackingBranchChoice {
  remoteRef: string
  defaultLocalBranch: string
}

export function localBranchNameSet(branches: RepoBranchState[]): Set<string> {
  return new Set(branches.map((branch) => branch.name))
}

export function branchNameValidationKey(
  branchName: string,
  branches: RepoBranchState[],
): BranchNameValidationKey | null {
  const trimmed = branchName.trim()
  if (!trimmed) return 'action.create-branch-name-required'
  if (!validateBranchName(trimmed).ok) return 'action.create-worktree-branch-invalid'
  if (localBranchNameSet(branches).has(trimmed)) return 'action.create-worktree-branch-exists'
  return null
}

export function remoteTrackingBranchChoices(
  remoteRefs: string[],
  branches: RepoBranchState[],
): RemoteTrackingBranchChoice[] {
  const localNames = localBranchNameSet(branches)
  return remoteRefs.flatMap((remoteRef) => {
    const defaultLocalBranch = deriveLocalBranchFromRemoteRef(remoteRef)
    if (!defaultLocalBranch || localNames.has(defaultLocalBranch)) return []
    return [{ remoteRef, defaultLocalBranch }]
  })
}

export function remoteRefMatchesQuery(remoteRef: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const normalized = remoteRef.toLowerCase()
  return tokens.every((token) => fuzzyTokenMatches(normalized, token))
}

function fuzzyTokenMatches(value: string, token: string): boolean {
  let offset = 0
  for (const char of token) {
    const next = value.indexOf(char, offset)
    if (next === -1) return false
    offset = next + 1
  }
  return true
}
