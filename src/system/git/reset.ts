import { gitResultWithOptions } from '#/system/git/helper.ts'
import type { ExecResult, RemoteAlignmentTarget } from '#/shared/git-types.ts'
import { parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import { getWorktreeContentState, worktreeContentStatesEqual } from '#/system/git/worktree-content-state.ts'

const FULL_GIT_OID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

/**
 * Run `git reset --hard` in the given working directory.
 * Discards all uncommitted changes without moving HEAD.
 * The cwd should be the worktree path, not the repo root.
 */
export async function resetHardToCurrentHead(cwd: string, signal?: AbortSignal): Promise<ExecResult> {
  return gitResultWithOptions(cwd, { signal }, 'reset', '--hard')
}

export async function alignWorktreeToRemoteRef(
  cwd: string,
  target: RemoteAlignmentTarget,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (
    !target.branch ||
    /[\0\r\n]/.test(target.branch) ||
    !parseRemoteBranchRef(target.remoteRef) ||
    !FULL_GIT_OID_RE.test(target.expectedHead) ||
    !FULL_GIT_OID_RE.test(target.remoteHead) ||
    !FULL_GIT_OID_RE.test(target.expectedContentState.indexHash) ||
    !FULL_GIT_OID_RE.test(target.expectedContentState.worktreeTree)
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }

  const branch = await gitResultWithOptions(cwd, { signal }, 'symbolic-ref', '--quiet', '--short', 'HEAD')
  if (!branch.ok || branch.message.trim() !== target.branch) {
    return signal?.aborted ? { ok: false, message: 'cancelled' } : { ok: false, message: 'error.repository-changed' }
  }
  const head = await gitResultWithOptions(cwd, { signal }, 'rev-parse', '--verify', 'HEAD^{commit}')
  if (!head.ok || head.message.trim().toLowerCase() !== target.expectedHead.toLowerCase()) {
    return signal?.aborted ? { ok: false, message: 'cancelled' } : { ok: false, message: 'error.repository-changed' }
  }
  const remoteHead = await gitResultWithOptions(
    cwd,
    { signal },
    'rev-parse',
    '--verify',
    `${target.remoteRef}^{commit}`,
  )
  if (!remoteHead.ok || remoteHead.message.trim().toLowerCase() !== target.remoteHead.toLowerCase()) {
    return signal?.aborted ? { ok: false, message: 'cancelled' } : { ok: false, message: 'error.repository-changed' }
  }
  const upstream = await gitResultWithOptions(
    cwd,
    { signal },
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  )
  if (!upstream.ok || upstream.message.trim() !== target.remoteRef) {
    return signal?.aborted ? { ok: false, message: 'cancelled' } : { ok: false, message: 'error.repository-changed' }
  }
  const contentState = await getWorktreeContentState(cwd, signal)
  if (!contentState || !worktreeContentStatesEqual(contentState, target.expectedContentState)) {
    return signal?.aborted ? { ok: false, message: 'cancelled' } : { ok: false, message: 'error.repository-changed' }
  }
  if (signal?.aborted) return { ok: false, message: 'cancelled' }

  // Once mutation starts, reset + clean form one non-interruptible unit. This
  // avoids cancellation leaving the worktree reset but not yet cleaned.
  const reset = await gitResultWithOptions(cwd, { signal: undefined }, 'reset', '--hard', target.remoteHead)
  if (!reset.ok) return { ...reset, repoChanged: true }
  const clean = await gitResultWithOptions(cwd, { signal: undefined }, 'clean', '-fd')
  return clean.ok ? clean : { ok: false, message: 'error.align-remote-clean-incomplete', repoChanged: true }
}

function pathspecMatchesPath(pathspec: string, path: string): boolean {
  return path === pathspec || path.startsWith(`${pathspec}/`)
}

export async function discardChangesForPaths(cwd: string, paths: string[], signal?: AbortSignal): Promise<ExecResult> {
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
