import { useRef, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import type { WorkspaceRecoveryExecuteResult, WorkspaceRecoveryPlan } from '#/shared/workspace-recovery.ts'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/web/components/ui/alert-dialog.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import type { BranchWorkspaceItemAction } from '#/web/components/repo-workspace/BranchWorkspaceItemMenu.tsx'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { applyWorkspaceDiscoveryResult } from '#/web/stores/repos/lifecycle-write-paths.ts'
import { runWithRepoInvalidationSource } from '#/web/stores/repos/invalidation-sources.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'
import { useT } from '#/web/stores/i18n.ts'
import { abortWorkspaceRecovery, executeWorkspaceRecovery, planWorkspaceRecovery } from '#/web/workspace-client.ts'
import { workspaceConfigurationRecoveryAvailable } from '#/web/workspace-configuration-recovery-policy.ts'

interface WorkspaceConfigurationRecoveryOptions {
  rootId: string
  workspace: WorkspaceProjectState | undefined
  disabled?: boolean
}

interface WorkspaceConfigurationRecoveryView {
  visible: boolean
  contextAction: BranchWorkspaceItemAction
  dialog: React.ReactNode
}

type RecoveryPending = 'plan' | 'execute' | null

export function useWorkspaceConfigurationRecovery({
  rootId,
  workspace,
  disabled = false,
}: WorkspaceConfigurationRecoveryOptions): WorkspaceConfigurationRecoveryView {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<WorkspaceRecoveryPlan | null>(null)
  const [result, setResult] = useState<WorkspaceRecoveryExecuteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<RecoveryPending>(null)
  const pendingRef = useRef<RecoveryPending>(null)
  const requestGeneration = useRef(0)
  const visible = workspaceConfigurationRecoveryAvailable(workspace)
  const actionDisabled = disabled || pending !== null

  const setPendingState = (value: RecoveryPending) => {
    pendingRef.current = value
    setPending(value)
  }

  const requestPlan = async () => {
    if (!visible || disabled || pendingRef.current) return
    const generation = requestGeneration.current + 1
    requestGeneration.current = generation
    setOpen(true)
    setPlan(null)
    setResult(null)
    setError(null)
    setPendingState('plan')
    const response = await planWorkspaceRecovery(rootId).catch(() => ({
      ok: false as const,
      message: 'workspace.recovery.failed',
    }))
    if (requestGeneration.current !== generation) return
    setPendingState(null)
    if (!response.ok) {
      setError(response.message)
      return
    }
    setPlan(response.plan)
  }

  const execute = async () => {
    if (!plan || pendingRef.current) return
    setResult(null)
    setError(null)
    setPendingState('execute')
    const response = await runWithRepoInvalidationSource('workspace', async (sourceToken) =>
      executeWorkspaceRecovery(rootId, { planToken: plan.token, sourceToken }).catch(() => ({
        ok: false as const,
        message: 'workspace.recovery.failed',
      })),
    )
    void mainWindowQueryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(rootId), exact: true })
    setPendingState(null)
    setResult(response)
    if (!response.ok) return
    applyWorkspaceDiscoveryResult(useReposStore.setState, useReposStore.getState, rootId, response.workspace)
    useReposStore.getState().activateWorkspaceOverview(rootId)
  }

  const close = () => {
    if (pendingRef.current === 'execute') return
    requestGeneration.current += 1
    setOpen(false)
    setPlan(null)
    setResult(null)
    setError(null)
    setPendingState(null)
  }

  const cancel = async () => {
    if (pendingRef.current === 'execute') {
      await abortWorkspaceRecovery(rootId).catch(() => ({ ok: false }))
      return
    }
    close()
  }

  const icon = <RotateCcw aria-hidden="true" />
  const contextAction: BranchWorkspaceItemAction = {
    label: 'workspace.recovery.action',
    icon,
    disabled: actionDisabled,
    busy: pending !== null,
    destructive: true,
    separated: true,
    onSelect: requestPlan,
  }

  return {
    visible,
    contextAction,
    dialog: (
      <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && void cancel()}>
        <AlertDialogContent data-testid="workspace-recovery-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workspace.recovery.title')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <RecoveryDialogBody plan={plan} result={result} error={error} pending={pending} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {result?.ok ? (
              <Button data-testid="workspace-recovery-close" size="sm" onClick={close}>
                {t('dialog.close')}
              </Button>
            ) : (result && !result.ok) || error ? (
              <>
                <Button data-testid="workspace-recovery-close" size="sm" variant="outline" onClick={close}>
                  {t('dialog.close')}
                </Button>
                <Button data-testid="workspace-recovery-retry" size="sm" variant="destructive" onClick={requestPlan}>
                  {t('workspace.recovery.retry')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  data-testid="workspace-recovery-cancel"
                  size="sm"
                  variant="outline"
                  disabled={pending === 'plan'}
                  onClick={() => void cancel()}
                >
                  {pending === 'execute' ? t('workspace.recovery.abort') : t('dialog.cancel')}
                </Button>
                <Button
                  data-testid="workspace-recovery-confirm"
                  size="sm"
                  variant="destructive"
                  disabled={!plan || pending !== null}
                  aria-busy={pending ? true : undefined}
                  onClick={() => void execute()}
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {pending === 'plan' ? t('workspace.recovery.planning') : t('workspace.recovery.confirm')}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  }
}

function RecoveryDialogBody({
  plan,
  result,
  error,
  pending,
}: {
  plan: WorkspaceRecoveryPlan | null
  result: WorkspaceRecoveryExecuteResult | null
  error: string | null
  pending: RecoveryPending
}) {
  const t = useT()
  if (pending === 'plan') return <p>{t('workspace.recovery.planning')}</p>
  if (result?.ok) {
    return (
      <div className="space-y-2">
        <p className={result.outcome === 'completed-with-residuals' ? 'text-warning' : 'text-foreground'}>
          {t(
            result.outcome === 'completed-with-residuals'
              ? 'workspace.recovery.result-residual'
              : 'workspace.recovery.result-success',
          )}
        </p>
        {result.branches.some((branch) => branch.outcome === 'record-removed') ? (
          <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5">
            {result.branches
              .filter((branch) => branch.outcome === 'record-removed')
              .map((branch) => (
                <li key={branch.id}>
                  <code className="break-all text-xs">{branch.branch}</code>
                  {branch.message ? ` — ${branch.message}` : null}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    )
  }
  if (result && !result.ok) {
    return (
      <div className="space-y-2">
        <p className="text-danger">{t('workspace.recovery.result-failed')}</p>
        <p className="break-all">{t(result.message)}</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-danger">{t('workspace.recovery.plan-failed')}</p>
        <p className="break-all">{t(error)}</p>
      </div>
    )
  }
  if (!plan) return null
  const requiredApprovals = Array.from(new Set(plan.branchWorkspaces.flatMap((branch) => branch.requiredApprovals)))
  return (
    <div className="space-y-3">
      <p>
        {t('workspace.recovery.confirm-summary', {
          branches: plan.branchWorkspaces.length,
          repositories: plan.discoveredRepositoryNames.length,
        })}
      </p>
      {plan.cleanupScope === 'registry-reset' ? (
        <p className="text-danger">{t('workspace.recovery.registry-reset-warning')}</p>
      ) : plan.cleanupScope === 'registry-repair' ? (
        <p className="text-warning">{t('workspace.recovery.registry-repair-warning')}</p>
      ) : null}
      {plan.branchWorkspaces.length > 0 ? (
        <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5">
          {plan.branchWorkspaces.map((branch) => (
            <li key={branch.id}>
              <code className="break-all text-xs">{branch.branch}</code>
              {branch.mode === 'record-only' ? ` — ${t('workspace.recovery.record-only')}` : null}
            </li>
          ))}
        </ul>
      ) : null}
      {requiredApprovals.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-foreground">{t('workspace.branch-workspace.approvals')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {requiredApprovals.map((approval) => (
              <li key={approval}>{t(`workspace.branch-workspace.approval.${approval}`)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-danger">{t('workspace.recovery.destructive-warning')}</p>
    </div>
  )
}
