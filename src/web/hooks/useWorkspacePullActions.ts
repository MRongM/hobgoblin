import { useCallback, useState } from 'react'
import type { WorkspacePullPlan, WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { abortWorkspacePull, executeWorkspacePull, planWorkspacePull } from '#/web/workspace-client.ts'

export function useWorkspacePullActions(
  rootId: string | null,
  onSettled?: (result: WorkspacePullResult) => void | Promise<void>,
) {
  const [plan, setPlan] = useState<WorkspacePullPlan | null>(null)
  const [result, setResult] = useState<WorkspacePullResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestPlan = useCallback(async () => {
    if (!rootId) return false
    setPending(true)
    setError(null)
    setResult(null)
    const response = await planWorkspacePull(rootId).catch(() => ({
      ok: false as const,
      message: 'workspace.pull.plan-failed',
    }))
    setPending(false)
    if (!response.ok) {
      setPlan(null)
      setError(response.message)
      return false
    }
    setPlan(response.plan)
    return true
  }, [rootId])

  const execute = useCallback(async () => {
    if (!rootId || !plan) return null
    setPending(true)
    setError(null)
    const response = await executeWorkspacePull(rootId, { planToken: plan.token }).catch(
      () =>
        ({
          ok: false,
          planToken: plan.token,
          members: [],
          message: 'workspace.pull.execute-failed',
        }) satisfies WorkspacePullResult,
    )
    setPending(false)
    if (!response.ok && response.message === 'workspace.pull.plan-stale') {
      await requestPlan()
      return response
    }
    setResult(response)
    if (!response.ok && response.message) setError(response.message)
    try {
      await onSettled?.(response)
    } catch {
      // Refresh is best-effort and must not replace the pull result.
    }
    return response
  }, [onSettled, plan, requestPlan, rootId])

  const cancel = useCallback(async () => {
    if (rootId) await abortWorkspacePull(rootId).catch(() => ({ ok: false }))
  }, [rootId])

  const reset = useCallback(() => {
    setPlan(null)
    setResult(null)
    setPending(false)
    setError(null)
  }, [])

  return { plan, result, pending, error, requestPlan, confirm: execute, retry: execute, cancel, reset }
}
