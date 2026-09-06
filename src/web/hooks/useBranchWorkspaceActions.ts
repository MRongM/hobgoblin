import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlan,
  BranchWorkspacePlanRequest,
  BranchWorkspaceReadResult,
} from '#/shared/branch-workspaces.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import {
  abortBranchWorkspace,
  executeBranchWorkspace,
  planBranchWorkspace,
  reorderBranchWorkspaces,
} from '#/web/workspace-client.ts'
import { useT } from '#/web/stores/i18n.ts'

type BranchWorkspacePendingPhase = 'planning' | 'executing' | null

export function useBranchWorkspaceActions(rootId: string | null) {
  const t = useT()
  const queryClient = useQueryClient()
  const [plan, setPlan] = useState<BranchWorkspacePlan | null>(null)
  const [request, setRequest] = useState<BranchWorkspacePlanRequest | null>(null)
  const [result, setResult] = useState<BranchWorkspaceExecuteResult | null>(null)
  const [pendingPhase, setPendingPhase] = useState<BranchWorkspacePendingPhase>(null)
  const [error, setError] = useState<string | null>(null)
  const activeExecutionRef = useRef<Promise<BranchWorkspaceExecuteResult | null> | null>(null)
  const viewGenerationRef = useRef(0)

  const invalidate = useCallback(async () => {
    if (!rootId) return
    await queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
  }, [queryClient, rootId])

  const requestPlan = useCallback(
    async (nextRequest: BranchWorkspacePlanRequest, signal?: AbortSignal) => {
      if (!rootId) return false
      const activeExecution = activeExecutionRef.current
      if (activeExecution) await activeExecution
      if (signal?.aborted) return false

      const generation = viewGenerationRef.current + 1
      viewGenerationRef.current = generation
      setPendingPhase('planning')
      setError(null)
      setResult(null)
      setRequest(nextRequest)
      setPlan(null)
      const response = await planBranchWorkspace(rootId, nextRequest, signal).catch(() =>
        signal?.aborted
          ? null
          : {
              ok: false as const,
              message: 'workspace.branch-workspace.plan-failed',
            },
      )
      if (viewGenerationRef.current !== generation) return false
      setPendingPhase(null)
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
    (approvals: BranchWorkspaceApproval[], options: { force?: boolean } = {}) => {
      if (!rootId || !plan || activeExecutionRef.current) return Promise.resolve(null)
      const generation = viewGenerationRef.current
      setPendingPhase('executing')
      setError(null)

      let execution!: Promise<BranchWorkspaceExecuteResult>
      execution = (async () => {
        try {
          const response = await executeBranchWorkspace(rootId, {
            planToken: plan.token,
            approvals,
            ...(options.force === true ? { force: true } : {}),
          }).catch(() => ({
            ok: false as const,
            message: 'workspace.branch-workspace.execute-failed',
            branchWorkspaceId: plan.branchWorkspaceId,
          }))
          const stalePlan =
            !response.ok && response.message === 'workspace.branch-workspace.plan-stale' && request !== null
          if (stalePlan) return response

          if (viewGenerationRef.current === generation) {
            setResult(response)
            if (!response.ok) setError(response.message)
          }
          if (response.ok && response.warnings?.length) {
            const cleanupWarning = response.warnings.some(
              (warning) => warning.kind === 'member-worktree-cleanup-failed',
            )
            toast.warning(
              t(
                cleanupWarning
                  ? 'workspace.branch-workspace.force-delete-cleanup-warning'
                  : 'workspace.branch-workspace.dependency-warning',
                { count: response.warnings.length },
              ),
              {
                description: response.warnings
                  .map((warning) => {
                    const name = 'repositoryName' in warning ? warning.repositoryName : warning.entryName
                    return `${name}: ${t(warning.message)}`
                  })
                  .join('\n'),
              },
            )
          }
          if (response.ok && response.snapshot) {
            const snapshot = response.snapshot
            queryClient.setQueryData<BranchWorkspaceReadResult>(branchWorkspaceQueryKey(rootId), (current) => {
              const items = current?.ok ? current.items : []
              const existingIndex = items.findIndex((item) => item.id === snapshot.id)
              const nextItems =
                existingIndex < 0
                  ? [...items, snapshot]
                  : items.map((item, index) => (index === existingIndex ? snapshot : item))
              return {
                ok: true,
                rootId,
                items: nextItems,
                auxiliaryCandidates: current?.ok ? current.auxiliaryCandidates : [],
              }
            })
          } else {
            await invalidate().catch(() => undefined)
          }
          return response
        } finally {
          if (activeExecutionRef.current === execution) activeExecutionRef.current = null
          setPendingPhase((current) => (current === 'executing' ? null : current))
        }
      })()
      activeExecutionRef.current = execution

      return execution.then(async (response) => {
        if (
          viewGenerationRef.current === generation &&
          !response.ok &&
          response.message === 'workspace.branch-workspace.plan-stale' &&
          request
        ) {
          await requestPlan(request)
        }
        return response
      })
    },
    [invalidate, plan, queryClient, request, requestPlan, rootId, t],
  )

  const forceConfirm = useCallback(
    async (approvals: BranchWorkspaceApproval[]) => await confirm(approvals, { force: true }),
    [confirm],
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

  const returnToSelection = useCallback(() => {
    setPlan(null)
    setResult(null)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    viewGenerationRef.current += 1
    setPlan(null)
    setRequest(null)
    setResult(null)
    setError(null)
    setPendingPhase(activeExecutionRef.current ? 'executing' : null)
  }, [])

  const planning = pendingPhase === 'planning'
  const executing = pendingPhase === 'executing'
  const pending = pendingPhase !== null

  return {
    plan,
    request,
    result,
    pending,
    planning,
    executing,
    error,
    requestPlan,
    confirm,
    forceConfirm,
    retry: confirm,
    cancel,
    reorder,
    returnToSelection,
    reset,
  }
}
