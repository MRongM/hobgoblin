import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import type { RepoFileSearchResult, RepoFileTreeResult } from '#/shared/file-tree.ts'
import { isRemoteRepoId } from '#/shared/rpc.ts'
import { listLocalFileTreeDirectory } from '#/system/file-tree/local.ts'
import { searchLocalFileTree } from '#/system/file-tree/search.ts'
import { listRemoteFileTreeDirectory, searchRemoteFileTree } from '#/system/ssh/git.ts'

export async function getRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  dirPath: string,
  signal?: AbortSignal,
): Promise<RepoFileTreeResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (isRemoteRepoId(repoId)) {
    const target = await resolveRemoteRepoTarget(repoId)
    return await listRemoteFileTreeDirectory(target, worktreePath, dirPath, { signal })
  }
  return await listLocalFileTreeDirectory(worktreePath, dirPath)
}

export async function searchRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RepoFileSearchResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (isRemoteRepoId(repoId)) {
    const target = await resolveRemoteRepoTarget(repoId)
    return await searchRemoteFileTree(target, worktreePath, query, { limit, signal })
  }
  return await searchLocalFileTree(worktreePath, query, { limit, signal })
}
