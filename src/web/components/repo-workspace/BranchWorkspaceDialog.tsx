import { useEffect, useMemo, useState } from 'react'
import { FolderKanban, LoaderCircle } from 'lucide-react'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceAuxiliaryCandidate,
  BranchWorkspaceAuxiliaryMode,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlan,
  BranchWorkspacePlanRequest,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import { Button } from '#/web/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/web/components/ui/dialog.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'

export interface BranchWorkspaceRepositoryOption {
  name: string
  available: boolean
  branches: string[]
  defaultBranch: string
}

interface BranchWorkspaceDialogProps {
  open: boolean
  mode: 'create' | 'repair' | 'remove'
  repositories: BranchWorkspaceRepositoryOption[]
  auxiliaryCandidates: BranchWorkspaceAuxiliaryCandidate[]
  workspace: BranchWorkspaceSnapshot | null
  plan: BranchWorkspacePlan | null
  result: BranchWorkspaceExecuteResult | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onPreview: (request: BranchWorkspacePlanRequest) => Promise<unknown>
  onConfirm: (approvals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>
  onRetry: (approvals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>
  onCancel: () => Promise<unknown>
}

export function BranchWorkspaceDialog({
  open,
  mode,
  repositories,
  auxiliaryCandidates,
  workspace,
  plan,
  result,
  pending,
  error,
  onOpenChange,
  onPreview,
  onConfirm,
  onRetry,
  onCancel,
}: BranchWorkspaceDialogProps) {
  const t = useT()
  const [branch, setBranch] = useState('')
  const [selectedRepositories, setSelectedRepositories] = useState<Record<string, boolean>>({})
  const [baseBranches, setBaseBranches] = useState<Record<string, string>>({})
  const [selectedAuxiliary, setSelectedAuxiliary] = useState<Record<string, boolean>>({})
  const [auxiliaryModes, setAuxiliaryModes] = useState<Record<string, BranchWorkspaceAuxiliaryMode>>({})
  const [alsoDeleteBranch, setAlsoDeleteBranch] = useState(false)
  const [alsoDeleteUpstream, setAlsoDeleteUpstream] = useState(false)
  const [approvals, setApprovals] = useState<BranchWorkspaceApproval[]>([])

  const fixedRepositories = useMemo(
    () => new Map(workspace?.repositories.map((member) => [member.repositoryName, member]) ?? []),
    [workspace],
  )
  const fixedAuxiliary = useMemo(
    () => new Map(workspace?.auxiliaryEntries.map((entry) => [entry.name, entry]) ?? []),
    [workspace],
  )

  useEffect(() => {
    if (!open) return
    setBranch(workspace?.branch ?? '')
    setSelectedRepositories(
      Object.fromEntries(repositories.map((repository) => [repository.name, fixedRepositories.has(repository.name)])),
    )
    setBaseBranches(
      Object.fromEntries(
        repositories.map((repository) => [
          repository.name,
          fixedRepositories.get(repository.name)?.baseBranch || repository.defaultBranch || repository.branches[0] || '',
        ]),
      ),
    )
    setSelectedAuxiliary(
      Object.fromEntries(auxiliaryCandidates.map((candidate) => [candidate.name, fixedAuxiliary.has(candidate.name)])),
    )
    setAuxiliaryModes(
      Object.fromEntries(
        auxiliaryCandidates.map((candidate) => [candidate.name, fixedAuxiliary.get(candidate.name)?.mode ?? 'symlink']),
      ),
    )
    setAlsoDeleteBranch(false)
    setAlsoDeleteUpstream(false)
    setApprovals([])
  }, [auxiliaryCandidates, fixedAuxiliary, fixedRepositories, open, repositories, workspace?.branch])

  useEffect(() => setApprovals([]), [plan?.token])

  const createRequest = (): Extract<BranchWorkspacePlanRequest, { operation: 'create' }> => ({
    operation: 'create',
    branch: branch.trim(),
    repositories: repositories.flatMap((repository) =>
      selectedRepositories[repository.name]
        ? [{ repositoryName: repository.name, baseBranch: baseBranches[repository.name] || repository.defaultBranch }]
        : [],
    ),
    auxiliaryEntries: auxiliaryCandidates.flatMap((candidate) =>
      selectedAuxiliary[candidate.name]
        ? [{ name: candidate.name, mode: auxiliaryModes[candidate.name] ?? ('symlink' as const) }]
        : [],
    ),
  })
  const request = (): BranchWorkspacePlanRequest | null => {
    if (mode === 'create') {
      const value = createRequest()
      return value.branch && value.repositories.length > 0 ? value : null
    }
    if (!workspace) return null
    if (mode === 'repair') return { operation: 'repair', branchWorkspaceId: workspace.id }
    return {
      operation: 'remove',
      branchWorkspaceId: workspace.id,
      alsoDeleteBranch,
      alsoDeleteUpstream: alsoDeleteBranch && alsoDeleteUpstream,
    }
  }
  const close = () => {
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const run = async (
    action: (confirmedApprovals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>,
  ) => {
    const response = await action(approvals)
    if (response?.ok) onOpenChange(false)
  }
  const requiredApprovalsSatisfied =
    !plan || plan.requiredApprovals.every((approval) => approvals.includes(approval))

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(`workspace.branch-workspace.dialog.${mode}.title`)}</DialogTitle>
          <DialogDescription>{t(`workspace.branch-workspace.dialog.${mode}.description`)}</DialogDescription>
        </DialogHeader>

        {!plan && mode === 'create' ? (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-xs font-medium">
              {t('workspace.branch-workspace.branch')}
              <Input
                aria-label={t('workspace.branch-workspace.branch')}
                value={branch}
                disabled={pending || !!workspace}
                className="font-mono"
                onChange={(event) => setBranch(event.target.value)}
              />
            </label>
            <fieldset className="grid gap-2 rounded-md border border-separator p-3">
              <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.repositories')}</legend>
              {repositories.map((repository) => {
                const fixed = fixedRepositories.has(repository.name)
                return (
                  <div key={repository.name} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] gap-3">
                    <label className={cn('flex items-center gap-2 text-xs', !repository.available && 'opacity-60')}>
                      <input
                        type="checkbox"
                        aria-label={t('workspace.branch-workspace.repository-named', { name: repository.name })}
                        checked={selectedRepositories[repository.name] === true}
                        disabled={pending || fixed || !repository.available}
                        onChange={(event) =>
                          setSelectedRepositories((current) => ({
                            ...current,
                            [repository.name]: event.target.checked,
                          }))
                        }
                      />
                      <span className="truncate font-medium">{repository.name}</span>
                      {fixed ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t('workspace.branch-workspace.member-fixed')}
                        </span>
                      ) : null}
                    </label>
                    <select
                      aria-label={t('workspace.branch-workspace.base-named', { name: repository.name })}
                      value={baseBranches[repository.name] ?? ''}
                      disabled={pending || fixed || !selectedRepositories[repository.name]}
                      className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
                      onChange={(event) =>
                        setBaseBranches((current) => ({ ...current, [repository.name]: event.target.value }))
                      }
                    >
                      {repository.branches.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </fieldset>
            <fieldset className="grid gap-2 rounded-md border border-separator p-3">
              <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.auxiliary')}</legend>
              {auxiliaryCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('workspace.branch-workspace.auxiliary-empty')}</p>
              ) : null}
              {auxiliaryCandidates.map((candidate) => {
                const fixed = fixedAuxiliary.has(candidate.name)
                return (
                  <div key={candidate.name} className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
                    <label className="flex min-w-0 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        aria-label={t('workspace.branch-workspace.auxiliary-named', { name: candidate.name })}
                        checked={selectedAuxiliary[candidate.name] === true}
                        disabled={pending || fixed}
                        onChange={(event) =>
                          setSelectedAuxiliary((current) => ({ ...current, [candidate.name]: event.target.checked }))
                        }
                      />
                      <span className="truncate">{candidate.name}</span>
                      {candidate.outsideRoot ? (
                        <span className="text-[10px] text-warning">
                          {t('workspace.branch-workspace.outside-root')}
                        </span>
                      ) : null}
                      {fixed ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t('workspace.branch-workspace.member-fixed')}
                        </span>
                      ) : null}
                    </label>
                    <select
                      aria-label={t('workspace.branch-workspace.mode-named', { name: candidate.name })}
                      value={auxiliaryModes[candidate.name] ?? 'symlink'}
                      disabled={pending || fixed || !selectedAuxiliary[candidate.name]}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      onChange={(event) =>
                        setAuxiliaryModes((current) => ({
                          ...current,
                          [candidate.name]: event.target.value as BranchWorkspaceAuxiliaryMode,
                        }))
                      }
                    >
                      <option value="symlink">{t('workspace.branch-workspace.mode.symlink')}</option>
                      <option value="copy">{t('workspace.branch-workspace.mode.copy')}</option>
                    </select>
                  </div>
                )
              })}
            </fieldset>
          </div>
        ) : null}

        {!plan && mode === 'remove' ? (
          <div className="grid gap-2 rounded-md border border-danger-border bg-danger-surface p-3 text-xs">
            <p>{t('workspace.branch-workspace.delete-warning')}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alsoDeleteBranch}
                disabled={pending}
                onChange={(event) => {
                  setAlsoDeleteBranch(event.target.checked)
                  if (!event.target.checked) setAlsoDeleteUpstream(false)
                }}
              />
              {t('workspace.branch-workspace.delete-local-branch')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alsoDeleteUpstream}
                disabled={pending || !alsoDeleteBranch}
                onChange={(event) => setAlsoDeleteUpstream(event.target.checked)}
              />
              {t('workspace.branch-workspace.delete-upstream-branch')}
            </label>
          </div>
        ) : null}

        {workspace ? <WorkspaceSummary workspace={workspace} /> : null}
        {plan ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-separator">
              {plan.steps.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">{t('workspace.branch-workspace.no-pending-steps')}</p>
              ) : (
                plan.steps.map((step) => (
                  <div key={step.id} className="border-b border-separator/60 px-3 py-2 text-xs last:border-b-0">
                    {step.label}
                  </div>
                ))
              )}
            </div>
            {plan.requiredApprovals.length > 0 ? (
              <fieldset className="grid gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.approvals')}</legend>
                {plan.requiredApprovals.map((approval) => (
                  <label key={approval} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={t(`workspace.branch-workspace.approval.${approval}`)}
                      checked={approvals.includes(approval)}
                      disabled={pending}
                      onChange={(event) =>
                        setApprovals((current) =>
                          event.target.checked
                            ? [...current, approval]
                            : current.filter((candidate) => candidate !== approval),
                        )
                      }
                    />
                    {t(`workspace.branch-workspace.approval.${approval}`)}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : pending ? (
          <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t('workspace.branch-workspace.planning')}
          </div>
        ) : null}

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {t(error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          {!plan ? (
            <Button
              type="button"
              data-action="preview"
              disabled={pending || request() === null}
              onClick={() => {
                const next = request()
                if (next) void onPreview(next)
              }}
            >
              {t('workspace.branch-workspace.preview')}
            </Button>
          ) : null}
          {plan ? (
            <Button
              type="button"
              data-action="confirm"
              variant={mode === 'remove' ? 'destructive' : 'default'}
              disabled={pending || !requiredApprovalsSatisfied}
              onClick={() => void run(onConfirm)}
            >
              {t(`workspace.branch-workspace.dialog.${mode}.confirm`)}
            </Button>
          ) : null}
          {result && !result.ok ? (
            <Button
              type="button"
              data-action="retry"
              variant="outline"
              disabled={pending || !requiredApprovalsSatisfied}
              onClick={() => void run(onRetry)}
            >
              {t('workspace.branch-workspace.retry')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceSummary({ workspace }: { workspace: BranchWorkspaceSnapshot }) {
  const t = useT()
  return (
    <div className="grid gap-1 rounded-md border border-separator bg-muted/20 p-3 text-xs">
      <div className="flex items-center gap-2 font-medium">
        <FolderKanban className="size-4" aria-hidden="true" />
        <span>{workspace.branch}</span>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{workspace.path}</span>
      {workspace.issues.map((issue, index) => (
        <span key={`${issue.kind}-${index}`} className="text-warning">
          {t(issue.message ?? `workspace.branch-workspace.issue.${issue.kind}`)}
        </span>
      ))}
    </div>
  )
}
