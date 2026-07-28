import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  BranchWorkspaceBatchMergeTargetInput,
  BranchWorkspaceCommitMessageInput,
  BranchWorkspaceGitActionExecuteInput,
  BranchWorkspaceGitActionKind,
  BranchWorkspaceGitActionPlan,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import {
  abortBranchWorkspaceGitAction,
  executeBranchWorkspaceGitAction,
  planBranchWorkspaceGitAction,
} from '#/web/workspace-client.ts'

export function useBranchWorkspaceGitActions(rootId: string | null) {
  const queryClient = useQueryClient()
  const [plan, setPlan] = useState<BranchWorkspaceGitActionPlan | null>(null)
  const [result, setResult] = useState<BranchWorkspaceGitActionResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalidate = useCallback(async () => {
    if (rootId) await queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
  }, [queryClient, rootId])

  const requestPlan = useCallback(
    async (kind: BranchWorkspaceGitActionKind, branchWorkspaceId: string) => {
      if (!rootId) return false
      setPending(true)
      setError(null)
      setResult(null)
      setPlan(null)
      const response = await planBranchWorkspaceGitAction(rootId, { kind, branchWorkspaceId }).catch(() => ({
        ok: false as const,
        message: 'workspace.branch-workspace.git-action.plan-failed',
      }))
      setPending(false)
      if (!response.ok) {
        setError(response.message)
        return false
      }
      setPlan(response.plan)
      return true
    },
    [rootId],
  )

  const execute = useCallback(
    async (input: BranchWorkspaceGitActionExecuteInput) => {
      if (!rootId || !plan) return null
      setPending(true)
      setError(null)
      const response = await executeBranchWorkspaceGitAction(rootId, input).catch(() => ({
        ok: false as const,
        kind: plan.kind,
        planToken: plan.token,
        branchWorkspaceId: plan.branchWorkspaceId,
        members: [],
        message: 'workspace.branch-workspace.git-action.execute-failed',
      }))
      setPending(false)
      if (!('kind' in response)) {
        setError(response.message)
        return null
      }
      setResult(response)
      if (!response.ok && response.message) setError(response.message)
      await invalidate().catch(() => undefined)
      return response
    },
    [invalidate, plan, rootId],
  )

  const executeBatchCommit = useCallback(
    async (messages: BranchWorkspaceCommitMessageInput[]) => {
      if (!plan || plan.kind !== 'batch-commit') return null
      return await execute({ kind: 'batch-commit', planToken: plan.token, messages })
    },
    [execute, plan],
  )

  const executeBatchMerge = useCallback(
    async (mode: BranchWorkspaceMergeMode, targets: BranchWorkspaceBatchMergeTargetInput[]) => {
      if (!plan || plan.kind !== 'batch-merge') return null
      return await execute({ kind: 'batch-merge', planToken: plan.token, mode, targets })
    },
    [execute, plan],
  )

  const executeSync = useCallback(
    async (kind: 'pull' | 'push') => {
      if (!plan || plan.kind !== kind) return null
      return await execute({ kind, planToken: plan.token })
    },
    [execute, plan],
  )

  const cancel = useCallback(async () => {
    if (rootId) await abortBranchWorkspaceGitAction(rootId).catch(() => ({ ok: false }))
  }, [rootId])

  const reset = useCallback(() => {
    setPlan(null)
    setResult(null)
    setPending(false)
    setError(null)
  }, [])

  return {
    plan,
    result,
    pending,
    error,
    requestPlan,
    executeBatchCommit,
    executeBatchMerge,
    executeSync,
    retryBatchCommit: executeBatchCommit,
    retryBatchMerge: executeBatchMerge,
    retrySync: executeSync,
    cancel,
    reset,
  }
}
