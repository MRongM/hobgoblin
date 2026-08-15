import { isSafeBranchName } from '#/shared/refnames.ts'

export interface RemoteTagRefParts {
  remote: string
  tag: string
  fullRef: string
}

export function parseRemoteTagRef(ref: string): RemoteTagRefParts | null {
  const fullRef = ref.trim()
  const slash = fullRef.indexOf('/')
  if (slash <= 0) return null
  const remote = fullRef.slice(0, slash)
  const tag = fullRef.slice(slash + 1)
  return isSafeRemoteName(remote) && isSafeBranchName(tag) ? { remote, tag, fullRef } : null
}

export function parseRemoteTagInput(remote: string, tag: string): RemoteTagRefParts | null {
  const normalizedRemote = remote.trim()
  const normalizedTag = tag.trim()
  const parsed = parseRemoteTagRef(`${normalizedRemote}/${normalizedTag}`)
  return parsed?.remote === normalizedRemote && parsed.tag === normalizedTag ? parsed : null
}

export function remoteTagRefsFromLsRemote(remote: string, output: string): string[] {
  if (!isSafeRemoteName(remote)) return []
  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1] ?? '')
    .filter((ref) => ref.startsWith('refs/tags/'))
    .map((ref) => ref.slice('refs/tags/'.length))
    .flatMap((tag) => {
      const parsed = parseRemoteTagInput(remote, tag)
      return parsed ? [parsed.fullRef] : []
    })
}

export function remoteTagRefMatchesQuery(ref: string, query: string): boolean {
  const haystack = ref.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function remoteTagSortKey(ref: string): string {
  const parsed = parseRemoteTagRef(ref)
  return parsed ? `${parsed.remote}\0${parsed.tag}` : `\uffff${ref}`
}

function isSafeRemoteName(remote: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)
}
