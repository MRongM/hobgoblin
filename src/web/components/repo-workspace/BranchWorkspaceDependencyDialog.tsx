import { useEffect, useMemo, useState } from 'react'
import { File, Folder, LoaderCircle } from 'lucide-react'
import type {
  BranchWorkspaceDependencyApproval,
  BranchWorkspaceDependencyCandidate,
  BranchWorkspaceDependencyExecuteResult,
  BranchWorkspaceDependencyPlan,
  BranchWorkspaceDependencyPlanRequest,
} from '#/shared/branch-workspace-dependencies.ts'
import {
  MaterializationCandidateList,
  type MaterializationCandidateChoice,
} from '#/web/components/MaterializationCandidateList.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface BranchWorkspaceDependencyDialogProps {
  open: boolean
  mode: 'add' | 'remove'
  branchWorkspaceId: string
  candidates: readonly BranchWorkspaceDependencyCandidate[]
  plan: BranchWorkspaceDependencyPlan | null
  result: BranchWorkspaceDependencyExecuteResult | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onPreview: (request: BranchWorkspaceDependencyPlanRequest) => Promise<unknown>
  onConfirm: (approvals: BranchWorkspaceDependencyApproval[]) => Promise<BranchWorkspaceDependencyExecuteResult | null>
  onCancel: () => Promise<unknown>
}

export function BranchWorkspaceDependencyDialog({
  open,
  mode,
  branchWorkspaceId,
  candidates,
  plan,
  pending,
  error,
  onOpenChange,
  onPreview,
  onConfirm,
  onCancel,
}: BranchWorkspaceDependencyDialogProps) {
  const t = useT()
  const [choices, setChoices] = useState<Record<string, MaterializationCandidateChoice>>({})
  const [removeNames, setRemoveNames] = useState<Set<string>>(() => new Set())
  const [approvals, setApprovals] = useState<BranchWorkspaceDependencyApproval[]>([])
  const addable = candidates
  const removable = useMemo(() => candidates.filter((candidate) => candidate.targetKind !== 'missing'), [candidates])

  useEffect(() => {
    if (!open) return
    setChoices({})
    setRemoveNames(new Set())
    setApprovals([])
  }, [branchWorkspaceId, mode, open])

  useEffect(() => {
    if (!plan) setApprovals([])
  }, [plan?.token])

  const request = (): BranchWorkspaceDependencyPlanRequest | null => {
    if (mode === 'add') {
      const entries = addable.flatMap((candidate) => {
        const choice = choices[candidate.name] ?? 'skip'
        return choice === 'skip' ? [] : [{ name: candidate.name, mode: choice }]
      })
      return entries.length > 0 ? { operation: 'add', branchWorkspaceId, entries } : null
    }
    const names = removable.flatMap((candidate) => (removeNames.has(candidate.name) ? [candidate.name] : []))
    return names.length > 0 ? { operation: 'remove', branchWorkspaceId, names } : null
  }
  const nextRequest = request()
  const requiredApprovalsSatisfied =
    !plan || plan.requiredApprovals.every((approval) => approvals.includes(approval))
  const replacesTargets =
    plan?.operation === 'add' && plan.entries.some((entry) => entry.targetKind !== 'missing')
  const close = () => {
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const confirm = async () => {
    const response = await onConfirm(approvals)
    if (response?.ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(`workspace.branch-workspace.dependency.${mode}.title`)}</DialogTitle>
          <DialogDescription>{t(`workspace.branch-workspace.dependency.${mode}.description`)}</DialogDescription>
        </DialogHeader>

        {!plan ? (
          mode === 'add' ? (
            <MaterializationCandidateList
              items={addable.map((candidate) => ({
                id: candidate.name,
                label: candidate.name,
                kind: candidate.sourceKind === 'directory' ? 'directory' : 'file',
                annotation:
                  candidate.targetKind !== 'missing' || candidate.outsideRoot ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px]">
                      {candidate.targetKind !== 'missing' ? (
                        <span className="text-destructive">
                          {t('workspace.branch-workspace.dependency.add.replaces-target')}
                        </span>
                      ) : null}
                      {candidate.outsideRoot ? (
                        <span className="text-warning">{t('workspace.branch-workspace.outside-root')}</span>
                      ) : null}
                    </span>
                  ) : undefined,
              }))}
              choices={choices}
              onChoiceChange={(name, choice) => setChoices((current) => ({ ...current, [name]: choice }))}
              headingId="branch-workspace-dependency-add-candidates"
              label={t('workspace.branch-workspace.dependency.add.available')}
              description={t('workspace.branch-workspace.dependency.add.available-description')}
              emptyMessage={t('workspace.branch-workspace.dependency.add.empty')}
              disabled={pending}
            />
          ) : (
            <DependencyRemovalList
              candidates={removable}
              selectedNames={removeNames}
              disabled={pending}
              onSelectedChange={(name, selected) =>
                setRemoveNames((current) => {
                  const next = new Set(current)
                  if (selected) next.add(name)
                  else next.delete(name)
                  return next
                })
              }
            />
          )
        ) : (
          <section className="grid gap-2 rounded-md border border-border/80 bg-muted/20 p-3">
            <h3 className="text-xs font-medium">{t('workspace.branch-workspace.dependency.preview-title')}</h3>
            <div className="grid gap-1">
              {plan.entries.map((entry) => (
                <div key={entry.name} className="flex min-w-0 items-center gap-2 text-xs">
                  {entry.name.includes('.') ? (
                    <File className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono" title={entry.targetPath}>
                    {entry.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t(
                      `workspace.branch-workspace.dependency.operation.${
                        plan.operation === 'add' && entry.targetKind !== 'missing' ? 'replace' : plan.operation
                      }`,
                    )}
                  </span>
                </div>
              ))}
            </div>
            {plan.requiredApprovals.length > 0 ? (
              <div className="mt-1 grid gap-2 border-t border-border/70 pt-2">
                {plan.requiredApprovals.map((approval) => (
                  <label key={approval} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      data-dependency-approval={approval}
                      checked={approvals.includes(approval)}
                      disabled={pending}
                      onCheckedChange={(checked) =>
                        setApprovals((current) =>
                          checked === true
                            ? [...new Set([...current, approval])]
                            : current.filter((candidate) => candidate !== approval),
                        )
                      }
                    />
                    {t(`workspace.branch-workspace.dependency.approval.${approval}`)}
                  </label>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {pending && !plan ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t('workspace.branch-workspace.dependency.planning')}
          </div>
        ) : null}
        {error ? <DialogError>{t(error)}</DialogError> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('dialog.cancel')}
          </Button>
          {!plan ? (
            <Button
              type="button"
              data-action="preview"
              disabled={pending || !nextRequest}
              onClick={() => nextRequest && void onPreview(nextRequest)}
            >
              {t('workspace.branch-workspace.preview')}
            </Button>
          ) : (
            <Button
              type="button"
              data-action="confirm"
              variant={plan.operation === 'remove' || replacesTargets ? 'destructive' : 'default'}
              disabled={pending || !requiredApprovalsSatisfied}
              onClick={() => void confirm()}
            >
              {t(
                replacesTargets
                  ? 'workspace.branch-workspace.dependency.add.replace-confirm'
                  : `workspace.branch-workspace.dependency.${plan.operation}.confirm`,
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DependencyRemovalList({
  candidates,
  selectedNames,
  disabled,
  onSelectedChange,
}: {
  candidates: readonly BranchWorkspaceDependencyCandidate[]
  selectedNames: ReadonlySet<string>
  disabled: boolean
  onSelectedChange: (name: string, selected: boolean) => void
}) {
  const t = useT()
  return (
    <section className="rounded-md border border-border/80 bg-muted/20">
      <div className="border-b border-border/70 px-3 py-2">
        <h3 className="text-xs font-medium">{t('workspace.branch-workspace.dependency.remove.available')}</h3>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {t('workspace.branch-workspace.dependency.remove.available-description')}
        </p>
      </div>
      {candidates.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t('workspace.branch-workspace.dependency.remove.empty')}
        </p>
      ) : (
        <ScrollArea className="max-h-44" scrollbarMode="compact">
          <div className="divide-y divide-border/60 p-1">
            {candidates.map((candidate) => {
              const Icon = candidate.targetKind === 'directory' ? Folder : File
              return (
                <label key={candidate.name} className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5">
                  <Checkbox
                    data-dependency-remove={candidate.name}
                    variant="destructive"
                    checked={selectedNames.has(candidate.name)}
                    disabled={disabled}
                    onCheckedChange={(checked) => onSelectedChange(candidate.name, checked === true)}
                  />
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{candidate.name}</span>
                </label>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </section>
  )
}
