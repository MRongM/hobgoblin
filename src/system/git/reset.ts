import { gitResultWithOptions } from '#/system/git/helper.ts'
import type { ExecResult } from '#/shared/git-types.ts'

/**
 * Run `git reset --hard` in the given working directory.
 * Discards all uncommitted changes without moving HEAD.
 * The cwd should be the worktree path, not the repo root.
 */
export async function resetHardToCurrentHead(
  cwd: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  return gitResultWithOptions(cwd, { signal }, 'reset', '--hard')
}

function pathspecMatchesPath(pathspec: string, path: string): boolean {
  return path === pathspec || path.startsWith(`${pathspec}/`)
}

export async function discardChangesForPaths(
  cwd: string,
  paths: string[],
  signal?: AbortSignal,
): Promise<ExecResult> {
  const tracked = await gitResultWithOptions(cwd, { signal }, 'ls-files', '--', ...paths)
  if (!tracked.ok) return tracked

  const trackedPaths = tracked.message.split('\n').filter(Boolean)
  const restorePaths = paths.filter((pathspec) =>
    trackedPaths.some((trackedPath) => pathspecMatchesPath(pathspec, trackedPath)),
  )
  if (restorePaths.length > 0) {
    const restore = await gitResultWithOptions(
      cwd,
      { signal },
      'restore',
      '--staged',
      '--worktree',
      '--source=HEAD',
      '--',
      ...restorePaths,
    )
    if (!restore.ok) return restore
  }
  return await gitResultWithOptions(cwd, { signal }, 'clean', '-fd', '--', ...paths)
}
