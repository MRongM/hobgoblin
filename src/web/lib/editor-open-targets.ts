import type { EditorOpenTarget, FilePathTarget } from '#/shared/file-path-target.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { openRemoteRepositoryEditor } from '#/web/remote-client.ts'
import { openRepositoryEditor } from '#/web/repo-client.ts'
import { joinPath } from '#/web/lib/paths.ts'

export function resolveWorktreeEditorTarget(worktreePath: string, target: FilePathTarget): FilePathTarget {
  return {
    ...target,
    path: joinPath(worktreePath, target.path),
  }
}

export async function openWorktreeEditorTarget(
  repoId: string,
  worktreePath: string,
  target: FilePathTarget,
): Promise<ExecResult> {
  const resolved: EditorOpenTarget = resolveWorktreeEditorTarget(worktreePath, target)
  return isRemoteRepoId(repoId) ? await openRemoteRepositoryEditor(repoId, resolved) : await openRepositoryEditor(resolved)
}
