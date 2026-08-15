import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  BranchWorkspaceBatchMergeInSourceInput,
  BranchWorkspaceBatchMergeOutTargetInput,
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

  const loadPlan = useCallback(
    async (kind: BranchWorkspaceGitActionKind, branchWorkspaceId: string) => {
      if (!rootId) return null
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
        return null
      }
      setPlan(response.plan)
      return response.plan
    },
    [rootId],
  )

  const requestPlan = useCallback(
    async (kind: BranchWorkspaceGitActionKind, branchWorkspaceId: string) =>
      (await loadPlan(kind, branchWorkspaceId)) !== null,
    [loadPlan],
  )

  const executePlan = useCallback(
    async (actionPlan: BranchWorkspaceGitActionPlan, input: BranchWorkspaceGitActionExecuteInput) => {
      if (!rootId) return null
      setPending(true)
      setError(null)
      const response = await executeBranchWorkspaceGitAction(rootId, input).catch(() => ({
        ok: false as const,
        kind: actionPlan.kind,
        planToken: actionPlan.token,
        branchWorkspaceId: actionPlan.branchWorkspaceId,
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
    [invalidate, rootId],
  )

  const execute = useCallback(
    async (input: BranchWorkspaceGitActionExecuteInput) => {
      if (!plan) return null
      return await executePlan(plan, input)
    },
    [executePlan, plan],
  )

  const executeBatchCommit = useCallback(
    async (messages: BranchWorkspaceCommitMessageInput[]) => {
      if (!plan || plan.kind !== 'batch-commit') return null
      return await execute({ kind: 'batch-commit', planToken: plan.token, messages })
    },
    [execute, plan],
  )

  const executeBatchCommitAndPush = useCallback(
    async (messages: BranchWorkspaceCommitMessageInput[]) => {
      if (!plan || plan.kind !== 'batch-commit') return null
      const commitPlan = plan
      const commitResult = await executePlan(commitPlan, {
        kind: 'batch-commit',
        planToken: commitPlan.token,
        messages,
      })
      if (!commitResult?.ok) return commitResult

      const pushPlan = await loadPlan('push', commitPlan.branchWorkspaceId)
      if (!pushPlan || pushPlan.kind !== 'push') return null
      const repositoryNames = pushPlan.members.filter((member) => member.ready).map((member) => member.repositoryName)
      if (repositoryNames.length === 0) {
        setError(
          pushPlan.members.find((member) => !member.ready)?.message ??
            'workspace.branch-workspace.git-action.execute-failed',
        )
        return null
      }
      return await executePlan(pushPlan, { kind: 'push', planToken: pushPlan.token, repositoryNames })
    },
    [executePlan, loadPlan, plan],
  )

  const executeBatchDiscard = useCallback(async () => {
    if (!plan || plan.kind !== 'batch-discard') return null
    return await execute({ kind: 'batch-discard', planToken: plan.token })
  }, [execute, plan])

  const executeBatchMergeIn = useCallback(
    async (mode: BranchWorkspaceMergeMode, sources: BranchWorkspaceBatchMergeInSourceInput[]) => {
      if (!plan || plan.kind !== 'batch-merge-in') return null
      return await execute({ kind: 'batch-merge-in', planToken: plan.token, mode, sources })
    },
    [execute, plan],
  )

  const executeBatchMergeOut = useCallback(
    async (mode: BranchWorkspaceMergeMode, targets: BranchWorkspaceBatchMergeOutTargetInput[]) => {
      if (!plan || plan.kind !== 'batch-merge-out') return null
      return await execute({ kind: 'batch-merge-out', planToken: plan.token, mode, targets })
    },
    [execute, plan],
  )

  const executeSync = useCallback(
    async (kind: 'pull' | 'push', repositoryNames: string[]) => {
      if (!plan || plan.kind !== kind) return null
      return await execute({ kind, planToken: plan.token, repositoryNames })
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
    executeBatchCommitAndPush,
    executeBatchDiscard,
    executeBatchMergeIn,
    executeBatchMergeOut,
    executeSync,
    retryBatchCommit: executeBatchCommit,
    retryBatchDiscard: executeBatchDiscard,
    retryBatchMergeIn: executeBatchMergeIn,
    retryBatchMergeOut: executeBatchMergeOut,
    retrySync: executeSync,
    cancel,
    reset,
  }
}
