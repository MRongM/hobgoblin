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
