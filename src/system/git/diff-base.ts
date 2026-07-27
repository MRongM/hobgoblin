import { devNull } from 'node:os'
import { git } from '#/system/git/helper.ts'

/**
 * Resolve the empty tree only when a failed HEAD-based diff came from an
 * unborn branch. Other Git failures retain their original diagnostic.
 */
export async function resolveDiffBaseAfterHeadFailure(
  worktreePath: string,
  originalError: unknown,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted || !hasExitCode(originalError, 128) || wasInterrupted(originalError)) throw originalError

  let headRef: string
  try {
    headRef = await git(worktreePath, ['symbolic-ref', '--quiet', 'HEAD'], { signal })
  } catch (probeError) {
    if (hasExitCode(probeError, 1)) throw originalError
    throw probeError
  }

  try {
    await git(worktreePath, ['show-ref', '--verify', '--quiet', headRef], { signal })
  } catch (probeError) {
    if (hasExitCode(probeError, 1)) {
      return await git(worktreePath, ['hash-object', '-t', 'tree', devNull], { signal })
    }
    throw probeError
  }

  throw originalError
}

function hasExitCode(error: unknown, expected: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    (error as { exitCode?: unknown }).exitCode === expected
  )
}

function wasInterrupted(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('timedOut' in error && (error as { timedOut?: unknown }).timedOut === true) ||
      ('isCanceled' in error && (error as { isCanceled?: unknown }).isCanceled === true))
  )
}
