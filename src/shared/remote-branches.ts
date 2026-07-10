import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'

export interface RemoteBranchRefParts {
  remote: string
  branch: string
  fullRef: string
}

export function parseRemoteBranchRef(ref: string): RemoteBranchRefParts | null {
  const fullRef = ref.trim()
  if (!isRemoteTrackingRef(fullRef)) return null
  const slash = fullRef.indexOf('/')
  if (slash <= 0) return null
  return {
    remote: fullRef.slice(0, slash),
    branch: fullRef.slice(slash + 1),
    fullRef,
  }
}

export function parseRemoteBranchInput(remote: string, branch: string): RemoteBranchRefParts | null {
  const normalizedRemote = remote.trim()
  const normalizedBranch = branch.trim()
  const parsed = parseRemoteBranchRef(`${normalizedRemote}/${normalizedBranch}`)
  if (!parsed) return null
  return parsed.remote === normalizedRemote && parsed.branch === normalizedBranch ? parsed : null
}

export function isProtectedRemoteBranchRef(ref: string): boolean {
  const parsed = parseRemoteBranchRef(ref)
  return parsed ? PROTECTED_BRANCHES.has(parsed.branch) : false
}

export function remoteBranchRefMatchesQuery(ref: string, query: string): boolean {
  const haystack = ref.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function remoteBranchSortKey(ref: string): string {
  const parsed = parseRemoteBranchRef(ref)
  return parsed ? `${parsed.remote}\0${parsed.branch}` : `\uffff${ref}`
}
