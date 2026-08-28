import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  BranchWorkspaceDependencyApproval,
  BranchWorkspaceDependencyCandidate,
  BranchWorkspaceDependencyExecuteResult,
  BranchWorkspaceDependencyPlan,
  BranchWorkspaceDependencyPlanRequest,
  BranchWorkspaceDependencyReadResult,
} from '#/shared/branch-workspace-dependencies.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import {
  abortBranchWorkspaceDependencies,
  executeBranchWorkspaceDependencies,
  planBranchWorkspaceDependencies,
  readBranchWorkspaceDependencies,
} from '#/web/workspace-client.ts'
import { runWithRepoInvalidationSource } from '#/web/stores/repos/invalidation-sources.ts'

export function useBranchWorkspaceDependencyActions(rootId: string | null) {
  const queryClient = useQueryClient()
  const [branchWorkspaceId, setBranchWorkspaceId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<BranchWorkspaceDependencyCandidate[]>([])
  const [request, setRequest] = useState<BranchWorkspaceDependencyPlanRequest | null>(null)
  const [plan, setPlan] = useState<BranchWorkspaceDependencyPlan | null>(null)
  const [result, setResult] = useState<BranchWorkspaceDependencyExecuteResult | null>(null)
  const [reading, setReading] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalidate = useCallback(async () => {
    if (!rootId) return
    await queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
  }, [queryClient, rootId])

  const read = useCallback(
    async (nextBranchWorkspaceId: string): Promise<BranchWorkspaceDependencyReadResult> => {
      if (!rootId) return { ok: false, message: 'workspace.branch-workspace.dependency.read-failed' }
      setReading(true)
      setError(null)
      setPlan(null)
      setResult(null)
      setRequest(null)
      setBranchWorkspaceId(nextBranchWorkspaceId)
      const response = await readBranchWorkspaceDependencies(rootId, nextBranchWorkspaceId).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.dependency.read-failed',
      }))
      setReading(false)
      if (!response.ok) {
        setCandidates([])
        setError(response.message)
        return response
      }
      setCandidates(response.candidates)
      return response
    },
    [rootId],
  )

  const requestPlan = useCallback(
    async (request: BranchWorkspaceDependencyPlanRequest, signal?: AbortSignal) => {
      if (!rootId) return false
      setPlanning(true)
      setError(null)
      setResult(null)
      setPlan(null)
      setRequest(request)
      setBranchWorkspaceId(request.branchWorkspaceId)
      const response = await planBranchWorkspaceDependencies(rootId, request, signal).catch(() =>
        signal?.aborted
          ? null
          : {
              ok: false as const,
              message: 'workspace.branch-workspace.dependency.plan-failed',
            },
      )
      setPlanning(false)
      if (!response || signal?.aborted) return false
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
    async (approvals: BranchWorkspaceDependencyApproval[]) => {
      if (!rootId || !plan) return null
      setExecuting(true)
      setError(null)
      const response = await runWithRepoInvalidationSource('workspace', async (sourceToken) =>
        executeBranchWorkspaceDependencies(rootId, { planToken: plan.token, approvals, sourceToken }).catch(() => ({
          ok: false as const,
          message: 'workspace.branch-workspace.dependency.execute-failed',
          operation: plan.operation,
          branchWorkspaceId: plan.branchWorkspaceId,
          completedNames: [],
        })),
      )
      setExecuting(false)
      setResult(response)
      if (!response.ok) setError(response.message)
      if (response.ok || (response.completedNames?.length ?? 0) > 0) {
        await invalidate().catch(() => undefined)
      }
      return response
    },
    [invalidate, plan, rootId],
  )

  const cancel = useCallback(async () => {
    if (!rootId) return
    await abortBranchWorkspaceDependencies(rootId).catch(() => ({ ok: false }))
  }, [rootId])

  const reset = useCallback(() => {
    setBranchWorkspaceId(null)
    setCandidates([])
    setRequest(null)
    setPlan(null)
    setResult(null)
    setReading(false)
    setPlanning(false)
    setExecuting(false)
    setError(null)
  }, [])

  const pending = reading || planning || executing

  return {
    branchWorkspaceId,
    candidates,
    request,
    plan,
    result,
    pending,
    reading,
    planning,
    executing,
    error,
    read,
    requestPlan,
    confirm,
    cancel,
    reset,
  }
}
