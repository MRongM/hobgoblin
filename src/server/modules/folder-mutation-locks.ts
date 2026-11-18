import path from 'node:path'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'

interface FolderMutationScope {
  repoId: string
  path: string
}

const active = new Set<readonly FolderMutationScope[]>()

/** Coordinate explicit folder renames and dependency writes that touch overlapping locations. */
export function acquireFolderMutationScopes(scopes: readonly FolderMutationScope[]): (() => void) | null {
  if ([...active].some((group) => group.some((left) => scopes.some((right) => overlap(left, right))))) return null
  active.add(scopes)
  return () => active.delete(scopes)
}

function overlap(left: FolderMutationScope, right: FolderMutationScope): boolean {
  const leftRemote = parseRemoteRepoId(left.repoId)
  const rightRemote = parseRemoteRepoId(right.repoId)
  if (!!leftRemote !== !!rightRemote) return false
  if (
    leftRemote &&
    rightRemote &&
    (leftRemote.alias !== rightRemote.alias || leftRemote.transport !== rightRemote.transport)
  )
    return false
  const pathApi = leftRemote ? path.posix : path
  const relative = pathApi.relative(left.path, right.path)
  const reverse = pathApi.relative(right.path, left.path)
  const contains = (value: string) =>
    !value || (value !== '..' && !value.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(value))
  return contains(relative) || contains(reverse)
}
