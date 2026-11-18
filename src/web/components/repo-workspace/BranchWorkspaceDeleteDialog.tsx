import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { abortBranchWorkspace, executeBranchWorkspace, planBranchWorkspace } from '#/web/workspace-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/web/components/ui/alert-dialog.tsx'

interface Props {
  rootId: string
  workspace: BranchWorkspaceSnapshot | null
  onOpenChange: (open: boolean) => void
  onDeleted: (workspace: BranchWorkspaceSnapshot) => void | Promise<void>
}

export function BranchWorkspaceDeleteDialog({ rootId, workspace, onOpenChange, onDeleted }: Props) {
  const t = useT()
  const [pending, setPending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)
  const cancellation = useRef<Promise<void> | null>(null)
  useEffect(
    () => () => {
      if (!active.current) return
      active.current.abort()
      if (!cancellation.current) void abortBranchWorkspace(rootId).catch(() => {})
    },
    [rootId],
  )

  async function remove() {
    if (!workspace || active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setError(null)
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const planned = await planBranchWorkspace(
          rootId,
          {
            operation: 'remove',
            branchWorkspaceId: workspace.id,
            alsoDeleteBranch: false,
            alsoDeleteUpstream: false,
          },
          controller.signal,
        )
        controller.signal.throwIfAborted()
        if (!planned.ok) {
          setError(planned.message)
          return
        }
        if (planned.plan.path !== workspace.path) {
          setError('workspace.branch-workspace.plan-stale')
          return
        }
        const result = await executeBranchWorkspace(rootId, {
          planToken: planned.plan.token,
          approvals: planned.plan.requiredApprovals,
        })
        if (result.ok) {
          await cancellation.current
          active.current = null
          await onDeleted(workspace)
          onOpenChange(false)
          return
        }
        if (result.message === 'workspace.branch-workspace.plan-stale' && attempt === 0 && !controller.signal.aborted)
          continue
        setError(result.message === 'cancelled' ? 'workspace.branch-workspace.delete-cancelled' : result.message)
        return
      }
    } catch {
      setError(
        controller.signal.aborted
          ? 'workspace.branch-workspace.delete-cancelled'
          : 'workspace.branch-workspace.execute-failed',
      )
    } finally {
      await cancellation.current
      cancellation.current = null
      active.current = null
      setPending(false)
      setCancelling(false)
    }
  }

  async function cancel() {
    if (cancellation.current) return
    if (!active.current) {
      onOpenChange(false)
      return
    }
    setCancelling(true)
    cancellation.current = abortBranchWorkspace(rootId).then(
      () => {},
      () => {},
    )
    active.current.abort()
    await cancellation.current
  }

  return (
    <AlertDialog
      open={workspace !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onOpenChange(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('workspace.branch-workspace.delete')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <p>{t('workspace.branch-workspace.delete-warning')}</p>
              <code className="break-all text-foreground">{workspace?.path}</code>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {pending ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('workspace.branch-workspace.progress.remove')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <Button data-action="cancel-delete" variant="outline" disabled={cancelling} onClick={() => void cancel()}>
            {t(pending ? 'workspace.branch-workspace.cancel' : 'dialog.cancel')}
          </Button>
          <Button
            data-action="delete-workspace"
            variant="destructive"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => void remove()}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('workspace.branch-workspace.delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
