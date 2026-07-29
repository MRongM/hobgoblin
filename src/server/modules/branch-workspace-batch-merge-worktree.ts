import {
  isRepositoryTemporaryWorktreePath,
  repositoryTemporaryWorktreePath,
} from '#/server/modules/repository-temporary-worktree.ts'

export function branchWorkspaceBatchMergeTemporaryWorktreePath(
  repoId: string,
  planToken: string,
  destinationBranch: string,
): string | null {
  return repositoryTemporaryWorktreePath(repoId, 'batch-merge', planToken, destinationBranch)
}

export function isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId: string, candidatePath: string): boolean {
  return isRepositoryTemporaryWorktreePath(repoId, 'batch-merge', candidatePath)
}
