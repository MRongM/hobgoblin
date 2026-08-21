import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'
import { parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import type { ExecResult } from '#/web/types.ts'
import type { RepoBranchAction, RunBranchActionOptions } from '#/web/stores/repos/branch-action-types.ts'

export interface BranchPushTarget {
  branch: string
  display: string
  upstream: string | null
  trackingGone: boolean
  protected: boolean
}

export function getBranchPushTarget(branch: {
  name: string
  tracking?: string
  trackingGone?: boolean
}): BranchPushTarget {
  const upstream = branch.tracking ? parseRemoteBranchRef(branch.tracking) : null
  return {
    branch: branch.name,
    display: upstream?.fullRef ?? branch.name,
    upstream: branch.tracking ?? null,
    trackingGone: branch.trackingGone === true,
    protected: PROTECTED_BRANCHES.has(upstream?.branch ?? branch.name),
  }
}

export function deleteBranchNeedsForceConfirm(result: ExecResult, force: boolean): boolean {
  return !force && !result.ok && result.message === 'error.branch-not-fully-merged'
}

export function removeWorktreeNeedsForceConfirm(
  result: ExecResult,
  alsoDeleteBranch: boolean,
  forceDeleteBranch: boolean,
): boolean {
  return (
    !result.ok && result.message === 'error.cannot-remove-unpushed-worktree' && alsoDeleteBranch && !forceDeleteBranch
  )
}

export async function dispatchRepoBranchAction(
  repoId: string,
  instanceToken: number,
  action: RepoBranchAction,
  runBranchAction: (
    id: string,
    action: RepoBranchAction,
    options?: RunBranchActionOptions,
  ) => Promise<ExecResult | null>,
  options?: {
    deferResultMessages?: string[]
    handleResult?: (result: ExecResult) => boolean
  },
): Promise<ExecResult | null> {
  const result = await runBranchAction(repoId, action, {
    token: instanceToken,
    deferResultMessages: options?.deferResultMessages,
  })
  if (!result || (!result.ok && result.message === 'cancelled')) return null
  options?.handleResult?.(result)
  return result
}

export async function dispatchRepoUiAction(
  repoId: string,
  instanceToken: number,
  op: string,
  fn: () => Promise<ExecResult>,
  setLastResult: (repoId: string, result: ExecResult, token: number) => void,
  options?: {
    silentSuccessOps?: Set<string>
    handleResult?: (result: ExecResult) => boolean
  },
): Promise<void> {
  let result: ExecResult
  try {
    result = await fn()
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  if (!result.ok && result.message === 'cancelled') return
  if (options?.handleResult?.(result)) return
  const skipSuccessToast = result.ok && options?.silentSuccessOps?.has(op)
  if (!skipSuccessToast) setLastResult(repoId, result, instanceToken)
}
