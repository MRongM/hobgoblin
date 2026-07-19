import { useEffect, useState } from 'react'
import { FolderGit2, GitBranchPlus, LoaderCircle } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmCheckbox } from '#/web/components/ConfirmCheckbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type {
  WorkspaceWorktreeBatchResult,
  WorkspaceWorktreePlan,
  WorkspaceWorktreePlanRequest,
} from '#/shared/workspace-worktrees.ts'
import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'

interface Props {
  open: boolean
  operation: 'create' | 'remove' | 'pull'
  initialBranch?: string
  baseBranches?: string[]
  removableBranches?: string[]
  plan: WorkspaceWorktreePlan | null
  result: WorkspaceWorktreeBatchResult | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onPreview: (request: WorkspaceWorktreePlanRequest) => Promise<unknown>
  onConfirm: () => Promise<WorkspaceWorktreeBatchResult | null>
  onRetry: () => Promise<WorkspaceWorktreeBatchResult | null>
  onCancel: () => Promise<unknown>
}

export function WorkspaceWorktreeDialog({
  open,
  operation,
  initialBranch = '',
  baseBranches = [],
  removableBranches = [],
  plan,
  result,
  pending,
  error,
  onOpenChange,
  onPreview,
  onConfirm,
  onRetry,
  onCancel,
}: Props) {
  const t = useT()
  const [branch, setBranch] = useState(initialBranch)
  const [baseBranch, setBaseBranch] = useState(baseBranches[0] ?? '')
  const [alsoDeleteBranch, setAlsoDeleteBranch] = useState(false)
  const [alsoDeleteUpstream, setAlsoDeleteUpstream] = useState(false)

  useEffect(() => {
    if (!open) return
    setBranch(operation === 'remove' ? initialBranch || removableBranches[0] || '' : initialBranch)
    setBaseBranch(baseBranches[0] ?? '')
    setAlsoDeleteBranch(false)
    setAlsoDeleteUpstream(false)
  }, [baseBranches, initialBranch, open, operation, removableBranches])

  const close = () => {
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const runBatchAction = async (action: () => Promise<WorkspaceWorktreeBatchResult | null>) => {
    const nextResult = await action()
    if (nextResult?.ok) onOpenChange(false)
  }
  const removal = operation === 'remove'
  const pull = operation === 'pull'
  const protectedRemovalBranch = removal && PROTECTED_BRANCHES.has(branch)
  const toggleDeleteBranch = (checked: boolean) => {
    setAlsoDeleteBranch(checked)
    if (!checked) setAlsoDeleteUpstream(false)
  }
  const preview = () => {
    if (operation === 'create' && branch.trim() && baseBranch) {
      void onPreview({ operation: 'create', branch: branch.trim(), baseBranch })
    } else if (operation === 'remove' && branch) {
      void onPreview({
        operation: 'remove',
        branch,
        alsoDeleteBranch,
        alsoDeleteUpstream: alsoDeleteBranch && alsoDeleteUpstream,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              removal
                ? 'workspace.worktree.remove-title'
                : pull
                  ? 'workspace.worktree.pull-title'
                  : 'workspace.worktree.create-title',
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              removal
                ? 'workspace.worktree.remove-description'
                : pull
                  ? 'workspace.worktree.pull-description'
                  : 'workspace.worktree.create-description',
            )}
          </DialogDescription>
        </DialogHeader>

        {!plan && operation === 'create' ? (
          <label className="grid gap-1.5 text-xs font-medium">
            {t('workspace.worktree.base-branch-label')}
            <select
              aria-label={t('workspace.worktree.base-branch-label')}
              value={baseBranch}
              disabled={pending}
              onChange={(event) => setBaseBranch(event.target.value)}
              className="h-8 rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {baseBranches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="mt-1.5">{t('workspace.worktree.branch-label')}</span>
            <Input
              autoFocus
              value={branch}
              placeholder={t('workspace.worktree.branch-placeholder')}
              disabled={pending}
              onChange={(event) => setBranch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && branch.trim() && baseBranch) preview()
              }}
            />
          </label>
        ) : null}

        {!plan && operation === 'remove' ? (
          <div className="grid gap-1.5 text-xs font-medium">
            <span>{t('workspace.worktree.remove-branch-label')}</span>
            <select
              autoFocus
              aria-label={t('workspace.worktree.remove-branch-label')}
              value={branch}
              disabled={pending}
              onChange={(event) => {
                const nextBranch = event.target.value
                setBranch(nextBranch)
                if (PROTECTED_BRANCHES.has(nextBranch)) toggleDeleteBranch(false)
              }}
              className="h-8 rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {removableBranches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="mt-2 grid gap-2 rounded-md border border-danger-border/70 bg-danger-surface/45 px-3 py-2 font-normal">
              <ConfirmCheckbox
                checked={alsoDeleteBranch}
                disabled={pending || protectedRemovalBranch}
                destructive
                onCheckedChange={toggleDeleteBranch}
                title={protectedRemovalBranch ? t('action.confirm-remove-worktree-protected-hint') : undefined}
              >
                {t('action.confirm-remove-worktree-also-delete-branch')}
              </ConfirmCheckbox>
              {alsoDeleteBranch && !protectedRemovalBranch ? (
                <ConfirmCheckbox
                  checked={alsoDeleteUpstream}
                  disabled={pending}
                  destructive
                  onCheckedChange={setAlsoDeleteUpstream}
                >
                  {t('action.confirm-delete-branch-also-delete-upstream')}
                </ConfirmCheckbox>
              ) : null}
            </div>
          </div>
        ) : null}

        {removal && plan ? (
          <p className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger">
            {t('workspace.worktree.remove-warning')}
          </p>
        ) : null}

        {plan ? (
          <div className="overflow-hidden rounded-md border border-separator bg-background">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_5rem] border-b border-separator bg-muted/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span>{t('workspace.worktree.repository')}</span>
              <span>{t('workspace.worktree.path')}</span>
              <span>{t('workspace.worktree.status')}</span>
            </div>
            {plan.members.map((member) => {
              const memberResult = result?.members.find((entry) => entry.repoId === member.repoId)
              return (
                <div
                  key={member.repoId}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_5rem] items-center gap-2 border-b border-separator/60 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      <FolderGit2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{member.repoId}</span>
                    </div>
                    {member.baseRef ? (
                      <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <GitBranchPlus className="size-3" aria-hidden="true" />
                        {member.baseRef}
                      </div>
                    ) : null}
                    {(member.bootstrapPreview?.copyCount ?? 0) > 0 ? (
                      <div className="mt-1 text-[10px] text-warning">
                        {t('workspace.worktree.bootstrap-copy', { count: member.bootstrapPreview!.copyCount })}
                      </div>
                    ) : null}
                  </div>
                  <span className="truncate font-mono text-[10px] text-muted-foreground" title={member.worktreePath}>
                    {member.worktreePath}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {memberResult
                      ? t(`workspace.worktree.phase.${memberResult.phase}`)
                      : t('workspace.worktree.phase.ready')}
                  </span>
                </div>
              )
            })}
          </div>
        ) : pending ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t('workspace.worktree.planning')}
          </div>
        ) : null}

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {t(error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('workspace.worktree.cancel')}
          </Button>
          {!plan && !pull ? (
            <Button
              type="button"
              data-action="preview"
              disabled={pending || !branch.trim() || (operation === 'create' && !baseBranch)}
              onClick={preview}
            >
              {t('workspace.worktree.preview')}
            </Button>
          ) : null}
          {plan ? (
            <Button
              type="button"
              data-action="confirm"
              variant={removal ? 'destructive' : 'default'}
              disabled={pending}
              onClick={() => void runBatchAction(onConfirm)}
            >
              {t(
                removal
                  ? 'workspace.worktree.remove-confirm'
                  : pull
                    ? 'workspace.worktree.pull-confirm'
                    : 'workspace.worktree.create-confirm',
              )}
            </Button>
          ) : null}
          {result && !result.ok ? (
            <Button
              type="button"
              data-action="retry"
              variant="outline"
              disabled={pending}
              onClick={() => void runBatchAction(onRetry)}
            >
              {t('workspace.worktree.retry')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
