import { createHash } from 'node:crypto'
import path from 'node:path'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

const TEMPORARY_BATCH_MERGE_WORKTREE_PREFIX = '.hobgoblin-batch-merge-'
const TEMPORARY_BATCH_MERGE_WORKTREE_HASH_LENGTH = 16

export function branchWorkspaceBatchMergeTemporaryWorktreePath(
  repoId: string,
  planToken: string,
  destinationBranch: string,
): string | null {
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return null
  const pathApi = isRemoteRepoId(repoId) ? path.posix : path
  const hash = createHash('sha256')
    .update(`${repoId}\0${planToken}\0${destinationBranch}`, 'utf8')
    .digest('hex')
    .slice(0, TEMPORARY_BATCH_MERGE_WORKTREE_HASH_LENGTH)
  return pathApi.join(
    pathApi.dirname(repositoryPath),
    `${TEMPORARY_BATCH_MERGE_WORKTREE_PREFIX}${pathApi.basename(repositoryPath)}-${hash}`,
  )
}

export function isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId: string, candidatePath: string): boolean {
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return false
  const pathApi = isRemoteRepoId(repoId) ? path.posix : path
  const normalizedCandidate = pathApi.normalize(candidatePath)
  if (pathApi.dirname(normalizedCandidate) !== pathApi.dirname(pathApi.normalize(repositoryPath))) return false
  const repositoryName = pathApi.basename(repositoryPath)
  const expected = `${TEMPORARY_BATCH_MERGE_WORKTREE_PREFIX}${repositoryName}-`
  const candidateName = pathApi.basename(normalizedCandidate)
  if (!candidateName.startsWith(expected)) return false
  return new RegExp(`^[0-9a-f]{${TEMPORARY_BATCH_MERGE_WORKTREE_HASH_LENGTH}}$`).test(
    candidateName.slice(expected.length),
  )
}
