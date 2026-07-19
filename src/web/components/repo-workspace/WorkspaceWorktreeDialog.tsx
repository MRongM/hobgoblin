import { useEffect, useState } from 'react'
import { ArrowRight, Check, FolderGit2, GitBranchPlus, LoaderCircle } from 'lucide-react'
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
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
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
  repositoryCount?: number
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
  repositoryCount = 0,
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
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-separator bg-muted/20 p-3">
              <Field>
                <FieldLabel htmlFor="workspace-worktree-base" className="text-xs">
                  {t('workspace.worktree.base-branch-label')}
                </FieldLabel>
                <select
                  id="workspace-worktree-base"
                  aria-label={t('workspace.worktree.base-branch-label')}
                  value={baseBranch}
                  disabled={pending}
                  onChange={(event) => setBaseBranch(event.target.value)}
                  className="h-8 rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {baseBranches.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex h-5 items-center gap-2 pl-2 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                <span className="h-5 w-3 rounded-bl-md border-b border-l border-separator" aria-hidden="true" />
                {t('workspace.worktree.creates-from')}
              </div>
              <Field>
                <FieldLabel htmlFor="workspace-worktree-branch" className="text-xs">
                  {t('workspace.worktree.branch-label')}
                </FieldLabel>
                <Input
                  id="workspace-worktree-branch"
                  autoFocus
                  className="font-mono"
                  value={branch}
                  placeholder={t('workspace.worktree.branch-placeholder')}
                  disabled={pending}
                  onChange={(event) => setBranch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && branch.trim() && baseBranch) preview()
                  }}
                />
              </Field>
            </div>
            <WorkspaceIntentSummary
              operation="create"
              branch={branch.trim()}
              baseBranch={baseBranch}
              repositoryCount={repositoryCount}
            />
          </div>
        ) : null}

        {!plan && operation === 'remove' ? (
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="workspace-worktree-remove-branch" className="text-xs">
                {t('workspace.worktree.remove-branch-label')}
              </FieldLabel>
              <select
                id="workspace-worktree-remove-branch"
                autoFocus
                aria-label={t('workspace.worktree.remove-branch-label')}
                value={branch}
                disabled={pending}
                onChange={(event) => {
                  const nextBranch = event.target.value
                  setBranch(nextBranch)
                  if (PROTECTED_BRANCHES.has(nextBranch)) toggleDeleteBranch(false)
                }}
                className="h-8 rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {removableBranches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="relative grid gap-2 overflow-hidden rounded-lg border border-danger-border/70 bg-danger-surface/35 px-3 py-2.5 text-xs">
              <span className="absolute bottom-3 left-[1.18rem] top-3 w-px bg-danger-border/70" aria-hidden="true" />
              <div
                data-workspace-removal-step="worktree"
                className="relative flex min-h-6 items-center gap-2 font-medium"
              >
                <span className="relative z-10 flex size-4 items-center justify-center rounded-full bg-danger text-danger-foreground">
                  <Check className="size-2.5" aria-hidden="true" />
                </span>
                <span>{t('workspace.worktree.remove-linked-worktree')}</span>
                <span className="ml-auto text-[10px] font-normal uppercase tracking-[0.05em] text-muted-foreground">
                  {t('workspace.worktree.always')}
                </span>
              </div>
              <div
                data-workspace-removal-cleanup
                className="relative z-10 grid grid-cols-2 gap-3 bg-danger-surface/90 pl-6"
              >
                <div className="min-w-0">
                  <ConfirmCheckbox
                    checked={alsoDeleteBranch}
                    disabled={pending || protectedRemovalBranch}
                    destructive
                    onCheckedChange={toggleDeleteBranch}
                    title={protectedRemovalBranch ? t('action.confirm-remove-worktree-protected-hint') : undefined}
                  >
                    {t('action.confirm-remove-worktree-also-delete-branch')}
                  </ConfirmCheckbox>
                  {protectedRemovalBranch ? (
                    <p className="mt-1 pl-6 text-[10px] leading-4 text-muted-foreground">
                      {t('action.confirm-remove-worktree-protected-hint')}
                    </p>
                  ) : null}
                </div>
                <ConfirmCheckbox
                  checked={alsoDeleteUpstream}
                  disabled={pending || protectedRemovalBranch || !alsoDeleteBranch}
                  destructive
                  onCheckedChange={setAlsoDeleteUpstream}
                >
                  {t('action.confirm-delete-branch-also-delete-upstream')}
                </ConfirmCheckbox>
              </div>
            </div>
            <WorkspaceIntentSummary operation="remove" branch={branch} repositoryCount={repositoryCount} />
          </div>
        ) : null}

        {plan ? (
          <WorkspaceIntentSummary
            operation={plan.operation}
            branch={plan.branch}
            baseBranch={plan.members.find((member) => member.baseRef)?.baseRef}
            repositoryCount={repositoryCount || plan.members.length}
          />
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
                      <span data-workspace-repository-id className="truncate" title={member.repoId}>
                        {lastPathSegment(member.repoId) || member.repoId}
                      </span>
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
              {t('workspace.worktree.check-repositories')}
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

function WorkspaceIntentSummary({
  operation,
  branch,
  baseBranch,
  repositoryCount,
}: {
  operation: 'create' | 'remove' | 'pull'
  branch: string
  baseBranch?: string
  repositoryCount: number
}) {
  const t = useT()
  const branchLabel = branch || t('workspace.worktree.branch-placeholder')

  return (
    <div
      data-testid="workspace-worktree-intent-summary"
      className="flex min-h-9 items-center gap-3 rounded-md border border-separator bg-muted/30 px-3 py-2 text-xs"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 font-mono">
        {operation === 'create' ? (
          <>
            <span className="min-w-0 truncate text-muted-foreground">{baseBranch || '—'}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        ) : null}
        <span className={cn('min-w-0 truncate font-medium', branch ? 'text-foreground' : 'text-muted-foreground')}>
          {branchLabel}
        </span>
      </div>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {t('workspace.worktree.repositories-count', { count: repositoryCount })}
      </span>
    </div>
  )
}
