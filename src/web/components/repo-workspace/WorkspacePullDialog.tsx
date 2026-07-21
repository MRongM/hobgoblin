import { LoaderCircle } from 'lucide-react'
import type { WorkspacePullPlan, WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useT } from '#/web/stores/i18n.ts'

interface WorkspacePullDialogProps {
  open: boolean
  plan: WorkspacePullPlan | null
  result: WorkspacePullResult | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<WorkspacePullResult | null>
  onRetry: () => Promise<WorkspacePullResult | null>
  onCancel: () => Promise<unknown>
}

export function WorkspacePullDialog({
  open,
  plan,
  result,
  pending,
  error,
  onOpenChange,
  onConfirm,
  onRetry,
  onCancel,
}: WorkspacePullDialogProps) {
  const t = useT()
  const close = () => {
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const run = async (action: () => Promise<WorkspacePullResult | null>) => {
    const response = await action()
    if (response?.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('workspace.pull-all')}</DialogTitle>
          <DialogDescription>{t('workspace.pull-all-description')}</DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="overflow-hidden rounded-md border border-separator">
            {plan.members.map((member) => {
              const memberResult = result?.members.find((candidate) => candidate.repoId === member.repoId)
              return (
                <div
                  key={member.repoId}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] gap-2 border-b border-separator/60 px-3 py-2 text-xs last:border-b-0"
                >
                  <span className="truncate font-medium">{lastPathSegment(member.repoId) || member.repoId}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{member.branch}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t(`workspace.pull.phase.${memberResult?.phase ?? 'ready'}`)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className={pending ? 'size-4 animate-spin' : 'size-4'} aria-hidden="true" />
            {t('workspace.pull.planning')}
          </div>
        )}
        {error ? <p className="text-xs text-danger">{t(error)}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('dialog.cancel')}
          </Button>
          {plan && !result ? (
            <Button type="button" data-action="confirm-pull" disabled={pending} onClick={() => void run(onConfirm)}>
              {t('workspace.pull-all-confirm')}
            </Button>
          ) : null}
          {result && !result.ok ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => void run(onRetry)}>
              {t('workspace.branch-workspace.retry')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
