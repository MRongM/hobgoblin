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
  const [plan, setPlan] = useState<BranchWorkspaceDependencyPlan | null>(null)
  const [result, setResult] = useState<BranchWorkspaceDependencyExecuteResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalidate = useCallback(async () => {
    if (!rootId) return
    await queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
  }, [queryClient, rootId])

  const read = useCallback(
    async (nextBranchWorkspaceId: string): Promise<BranchWorkspaceDependencyReadResult> => {
      if (!rootId) return { ok: false, message: 'workspace.branch-workspace.dependency.read-failed' }
      setPending(true)
      setError(null)
      setPlan(null)
      setResult(null)
      setBranchWorkspaceId(nextBranchWorkspaceId)
      const response = await readBranchWorkspaceDependencies(rootId, nextBranchWorkspaceId).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.dependency.read-failed',
      }))
      setPending(false)
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
    async (request: BranchWorkspaceDependencyPlanRequest) => {
      if (!rootId) return false
      setPending(true)
      setError(null)
      setResult(null)
      setBranchWorkspaceId(request.branchWorkspaceId)
      const response = await planBranchWorkspaceDependencies(rootId, request).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.dependency.plan-failed',
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
    async (approvals: BranchWorkspaceDependencyApproval[]) => {
      if (!rootId || !plan) return null
      setPending(true)
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
      setPending(false)
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
    setPlan(null)
    setResult(null)
    setPending(false)
    setError(null)
  }, [])

  return { branchWorkspaceId, candidates, plan, result, pending, error, read, requestPlan, confirm, cancel, reset }
}
