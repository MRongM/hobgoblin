import type { RepoState } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'

export const NON_GIT_REPO_OPERATION_RESULT: ExecResult = {
  ok: false,
  message: 'error.not-git-repo',
}

export function repoSupportsGitData(repo: Pick<RepoState, 'isGitRepo'> | null | undefined): boolean {
  return !!repo && repo.isGitRepo !== false
}

export function repoIsPlainWorkspace(repo: Pick<RepoState, 'isGitRepo'> | null | undefined): boolean {
  return !!repo && repo.isGitRepo === false
}

export function repoPlainWorkspacePath(
  repo: Pick<RepoState, 'id' | 'isGitRepo' | 'remote'> | null | undefined,
): string | null {
  if (!repo || repo.isGitRepo !== false) return null
  if (!isRemoteRepoId(repo.id)) return repo.id
  return repo.remote.target?.remotePath ?? parseRemoteRepoId(repo.id)?.remotePath ?? null
}
