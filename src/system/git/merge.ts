import { isSafeBranchName } from '#/shared/refnames.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import { git, gitResultWithOptions } from '#/system/git/helper.ts'
import { parseStatus } from '#/system/git/parsers.ts'
import type { ExecResult } from '#/shared/git-types.ts'

/**
 * Merge the given local branch into the current branch of the worktree at cwd.
 * Runs `git merge -- <branch>`. On conflict the caller receives the git stderr.
 */
export async function mergeBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await gitResultWithOptions(cwd, { signal }, 'merge', '--', branch)
  if (result.ok || signal?.aborted) return result
  return await withMergeConflictReason(cwd, result, signal)
}

async function withMergeConflictReason(
  cwd: string,
  result: ExecResult,
  signal?: AbortSignal,
): Promise<ExecResult> {
  try {
    const status = await git(cwd, ['status', '--porcelain', '-z'], { signal })
    if (signal?.aborted) return result
    return hasUnmergedStatusEntries(parseStatus(status)) ? { ...result, reason: 'merge-conflict' } : result
  } catch {
    return result
  }
}
