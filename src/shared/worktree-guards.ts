import path from 'node:path'
import type { WorktreeInfo } from '#/shared/git-types.ts'
import { windowsPathIdentityKey } from '#/shared/path-semantics.ts'

export type KnownWorktreeResult =
  | { ok: true; path: string }
  | { ok: false; message: 'error.invalid-worktree-path' | 'error.worktree-not-found-for-branch' }

export function resolveKnownWorktree(
  worktrees: WorktreeInfo[],
  worktreePath: string,
  branch?: string,
): KnownWorktreeResult {
  const target = worktrees.find((wt) => sameFilesystemPath(wt.path, worktreePath) && (!branch || wt.branch === branch))
  if (!target) {
    return { ok: false, message: branch ? 'error.worktree-not-found-for-branch' : 'error.invalid-worktree-path' }
  }
  return { ok: true, path: target.path }
}

export type RemovableWorktreeResult =
  | { ok: true; target: WorktreeInfo }
  | { ok: false; message: 'error.cannot-remove-main-worktree' | 'error.worktree-not-found-for-branch' }

export function resolveRemovableWorktree(
  worktrees: WorktreeInfo[],
  branch: string | undefined,
  worktreePath: string,
  repoRoot: string,
): RemovableWorktreeResult {
  const target = worktrees.find((wt) => sameFilesystemPath(wt.path, worktreePath) && (!branch || wt.branch === branch))
  if (!target) return { ok: false, message: 'error.worktree-not-found-for-branch' }
  if (!repoRoot || !target.path || target.isPrimary || sameFilesystemPath(target.path, repoRoot)) {
    return { ok: false, message: 'error.cannot-remove-main-worktree' }
  }
  return { ok: true, target }
}

export type PrunableWorktreeResult =
  | { ok: true; target: WorktreeInfo }
  | {
      ok: false
      message:
        | 'error.worktree-not-prunable'
        | 'error.cannot-remove-main-worktree'
        | 'error.cannot-remove-locked-worktree'
    }

export function resolvePrunableWorktree(
  worktrees: WorktreeInfo[],
  worktreePath: string,
  repoRoot: string,
): PrunableWorktreeResult {
  const target = worktrees.find((wt) => sameFilesystemPath(wt.path, worktreePath))
  if (!target) return { ok: false, message: 'error.worktree-not-prunable' }
  if (!repoRoot || !target.path || target.isPrimary || sameFilesystemPath(target.path, repoRoot)) {
    return { ok: false, message: 'error.cannot-remove-main-worktree' }
  }
  if (target.isLocked) return { ok: false, message: 'error.cannot-remove-locked-worktree' }
  if (target.isPrunable !== true) return { ok: false, message: 'error.worktree-not-prunable' }
  return { ok: true, target }
}

function sameFilesystemPath(left: string, right: string): boolean {
  const leftWindowsIdentity = windowsPathIdentityKey(left)
  const rightWindowsIdentity = windowsPathIdentityKey(right)
  if (leftWindowsIdentity !== null || rightWindowsIdentity !== null) {
    return leftWindowsIdentity !== null && leftWindowsIdentity === rightWindowsIdentity
  }
  return path.resolve(left) === path.resolve(right)
}
