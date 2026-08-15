import type { EditorOpenTarget, FilePathTarget } from '#/shared/file-path-target.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { openRemoteRepositoryEditor } from '#/web/remote-client.ts'
import { openRepositoryEditor } from '#/web/repo-client.ts'
import { joinWorktreeRelativePath, pathStyle, worktreeRelativePathFromAbsolute } from '#/shared/path-semantics.ts'

export function resolveWorktreeEditorTarget(worktreePath: string, target: FilePathTarget): FilePathTarget | null {
  if (pathStyle(target.path) !== 'relative') {
    return worktreeRelativePathFromAbsolute(worktreePath, target.path) === null ? null : target
  }
  return {
    ...target,
    path: joinWorktreeRelativePath(worktreePath, target.path),
  }
}

export async function openWorktreeEditorTarget(
  repoId: string,
  worktreePath: string,
  target: FilePathTarget,
): Promise<ExecResult> {
  const resolved: EditorOpenTarget | null = resolveWorktreeEditorTarget(worktreePath, target)
  if (!resolved) return { ok: false, message: 'error.invalid-path' }
  return isRemoteRepoId(repoId) ? await openRemoteRepositoryEditor(repoId, resolved) : await openRepositoryEditor(resolved)
}
