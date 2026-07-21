import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlan,
  BranchWorkspacePlanRequest,
} from '#/shared/branch-workspaces.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import {
  abortBranchWorkspace,
  executeBranchWorkspace,
  planBranchWorkspace,
  reorderBranchWorkspaces,
} from '#/web/workspace-client.ts'

export function useBranchWorkspaceActions(rootId: string | null) {
  const queryClient = useQueryClient()
  const [plan, setPlan] = useState<BranchWorkspacePlan | null>(null)
  const [request, setRequest] = useState<BranchWorkspacePlanRequest | null>(null)
  const [result, setResult] = useState<BranchWorkspaceExecuteResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalidate = useCallback(async () => {
    if (!rootId) return
    await queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
  }, [queryClient, rootId])

  const requestPlan = useCallback(
    async (nextRequest: BranchWorkspacePlanRequest) => {
      if (!rootId) return false
      setPending(true)
      setError(null)
      setResult(null)
      setRequest(nextRequest)
      const response = await planBranchWorkspace(rootId, nextRequest).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.plan-failed',
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

  const confirm = useCallback(
    async (approvals: BranchWorkspaceApproval[]) => {
      if (!rootId || !plan) return null
      setPending(true)
      setError(null)
      const response = await executeBranchWorkspace(rootId, { planToken: plan.token, approvals }).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.execute-failed',
        branchWorkspaceId: plan.branchWorkspaceId,
      }))
      setPending(false)
      if (!response.ok && response.message === 'workspace.branch-workspace.plan-stale' && request) {
        await requestPlan(request)
        return response
      }
      setResult(response)
      if (!response.ok) setError(response.message)
      await invalidate().catch(() => undefined)
      return response
    },
    [invalidate, plan, request, requestPlan, rootId],
  )

  const cancel = useCallback(async () => {
    if (!rootId) return
    await abortBranchWorkspace(rootId).catch(() => ({ ok: false }))
  }, [rootId])

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      if (!rootId) return false
      const response = await reorderBranchWorkspaces(rootId, orderedIds).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.reorder-failed',
      }))
      if (!response.ok) {
        setError(response.message)
        return false
      }
      await invalidate().catch(() => undefined)
      return true
    },
    [invalidate, rootId],
  )

  const reset = useCallback(() => {
    setPlan(null)
    setRequest(null)
    setResult(null)
    setPending(false)
    setError(null)
  }, [])

  return { plan, request, result, pending, error, requestPlan, confirm, retry: confirm, cancel, reorder, reset }
}
