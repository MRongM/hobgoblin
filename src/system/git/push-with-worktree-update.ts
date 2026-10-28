import { stripVTControlCharacters } from 'node:util'
import type { ExecResult } from '#/shared/git-types.ts'

export const WORKTREE_UPDATE_RECEIVE_PACK = 'git -c receive.denyCurrentBranch=updateInstead receive-pack'
const CHECKED_OUT_BRANCH_REJECTION =
  /^[ \t]*![ \t]+\[remote rejected\][^\r\n]*\(branch is currently checked out\)[ \t\r]*$/m

/** Let the receiver check and update its worktree without persisting config. */
export async function pushWithWorktreeUpdate(
  runPush: (updateWorktree: boolean) => Promise<ExecResult>,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  const result = await runPush(false)
  if (result.ok || !CHECKED_OUT_BRANCH_REJECTION.test(stripVTControlCharacters(result.message))) return result
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  return await runPush(true)
}
