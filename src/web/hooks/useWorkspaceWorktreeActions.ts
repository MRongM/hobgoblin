import { useCallback, useState } from 'react'
import type {
  WorkspaceWorktreeBatchResult,
  WorkspaceWorktreePlan,
  WorkspaceWorktreePlanRequest,
} from '#/shared/workspace-worktrees.ts'
import { abortWorkspaceWorktree, executeWorkspaceWorktree, planWorkspaceWorktree } from '#/web/workspace-client.ts'

export function useWorkspaceWorktreeActions(
  rootId: string | null,
  onSettled?: (result: WorkspaceWorktreeBatchResult) => void | Promise<void>,
) {
  const [plan, setPlan] = useState<WorkspaceWorktreePlan | null>(null)
  const [request, setRequest] = useState<WorkspaceWorktreePlanRequest | null>(null)
  const [result, setResult] = useState<WorkspaceWorktreeBatchResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPlan = useCallback(
    async (nextRequest: WorkspaceWorktreePlanRequest) => {
      if (!rootId) return false
      setPending(true)
      setError(null)
      setResult(null)
      setRequest(nextRequest)
      const response = await planWorkspaceWorktree(rootId, nextRequest).catch(() => ({
        ok: false as const,
        message: 'workspace.worktree.plan-failed',
      }))
      setPending(false)
      if (!response.ok) {
        setPlan(null)
        setError(response.message)
        return false
      }
      setPlan(response.plan)
      return true
    },
    [rootId],
  )

  const execute = useCallback(async () => {
    if (!rootId || !plan) return null
    setPending(true)
    setError(null)
    const response = await executeWorkspaceWorktree(rootId, {
      planToken: plan.token,
      approveBootstrap: true,
    }).catch(
      () =>
        ({
          ok: false,
          planToken: plan.token,
          operation: plan.operation,
          branch: plan.branch,
          members: [],
          message: 'workspace.worktree.execute-failed',
        }) satisfies WorkspaceWorktreeBatchResult,
    )
    setPending(false)
    if (response.message === 'workspace.worktree.plan-stale' && request) {
      await loadPlan(request)
      return response
    }
    setResult(response)
    if (!response.ok && response.message) setError(response.message)
    try {
      await onSettled?.(response)
    } catch {
      // Refresh is best-effort; it must not replace the authoritative batch result.
    }
    return response
  }, [loadPlan, onSettled, plan, request, rootId])

  const cancel = useCallback(async () => {
    if (rootId) await abortWorkspaceWorktree(rootId).catch(() => ({ ok: false }))
  }, [rootId])

  const reset = useCallback(() => {
    setPlan(null)
    setRequest(null)
    setResult(null)
    setError(null)
    setPending(false)
  }, [])

  return {
    plan,
    result,
    pending,
    error,
    requestPlan: loadPlan,
    requestCreate: (branch: string, baseBranch: string) => loadPlan({ operation: 'create', branch, baseBranch }),
    requestRemove: (branch: string, alsoDeleteBranch: boolean, alsoDeleteUpstream: boolean) =>
      loadPlan({
        operation: 'remove',
        branch,
        alsoDeleteBranch,
        alsoDeleteUpstream: alsoDeleteBranch && alsoDeleteUpstream,
      }),
    requestPull: () => loadPlan({ operation: 'pull' }),
    confirm: execute,
    retry: execute,
    cancel,
    reset,
  }
}
