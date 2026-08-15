import { createHash } from 'node:crypto'
import path from 'node:path'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export type RepositoryTemporaryWorktreeNamespace = 'batch-merge' | 'merge-out'

const TEMPORARY_WORKTREE_HASH_LENGTH = 16

export function repositoryTemporaryWorktreePath(
  repoId: string,
  namespace: RepositoryTemporaryWorktreeNamespace,
  token: string,
  branch: string,
): string | null {
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return null
  const pathApi = isRemoteRepoId(repoId) ? path.posix : path
  const hash = createHash('sha256')
    .update(`${repoId}\0${namespace}\0${token}\0${branch}`, 'utf8')
    .digest('hex')
    .slice(0, TEMPORARY_WORKTREE_HASH_LENGTH)
  return pathApi.join(
    pathApi.dirname(repositoryPath),
    `.hobgoblin-${namespace}-${pathApi.basename(repositoryPath)}-${hash}`,
  )
}

export function isRepositoryTemporaryWorktreePath(
  repoId: string,
  namespace: RepositoryTemporaryWorktreeNamespace,
  candidatePath: string,
): boolean {
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return false
  const pathApi = isRemoteRepoId(repoId) ? path.posix : path
  const normalizedRepository = pathApi.normalize(repositoryPath)
  const normalizedCandidate = pathApi.normalize(candidatePath)
  if (pathApi.dirname(normalizedCandidate) !== pathApi.dirname(normalizedRepository)) return false
  const prefix = `.hobgoblin-${namespace}-${pathApi.basename(normalizedRepository)}-`
  const candidateName = pathApi.basename(normalizedCandidate)
  if (!candidateName.startsWith(prefix)) return false
  return new RegExp(`^[0-9a-f]{${TEMPORARY_WORKTREE_HASH_LENGTH}}$`).test(candidateName.slice(prefix.length))
}
