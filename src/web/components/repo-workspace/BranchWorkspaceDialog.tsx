import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Circle, FolderKanban, LoaderCircle, RefreshCw, X } from 'lucide-react'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceAuxiliaryCandidate,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlan,
  BranchWorkspacePlanRequest,
  BranchWorkspacePlanStep,
  BranchWorkspaceReadResult,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import type { WorktreeBootstrapPreflight } from '#/shared/worktree-bootstrap-summary.ts'
import {
  WorktreeBootstrapCandidateList,
  type WorktreeBootstrapCandidateChoice,
} from '#/web/components/WorktreeBootstrapCandidateList.tsx'
import {
  MaterializationCandidateList,
  type MaterializationCandidateChoice,
} from '#/web/components/MaterializationCandidateList.tsx'
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
import { getRepositoryWorktreeBootstrapPreflight } from '#/web/repo-client.ts'
import {
  projectBranchWorkspaceOperationProgress,
  type BranchWorkspaceStepProgressStatus,
} from '#/web/components/repo-workspace/branch-workspace-operation-progress.ts'

export interface BranchWorkspaceRepositoryOption {
  id: string
  name: string
  available: boolean
  branches: string[]
  defaultBranch: string
  sourceWorktreeByBranch?: Record<string, string>
}

type RepositoryBootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; preflight: WorktreeBootstrapPreflight }
  | { status: 'error' }

interface BranchWorkspaceDialogProps {
  open: boolean
  mode: 'create' | 'extend' | 'reduce' | 'repair' | 'remove'
  repositories: BranchWorkspaceRepositoryOption[]
  auxiliaryCandidates: BranchWorkspaceAuxiliaryCandidate[]
  workspace: BranchWorkspaceSnapshot | null
  progressWorkspace: BranchWorkspaceSnapshot | null
  fixedReduceRepositoryName?: string | null
  plan: BranchWorkspacePlan | null
  result: BranchWorkspaceExecuteResult | null
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onRefreshAuxiliaryCandidates: () => Promise<BranchWorkspaceReadResult>
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
  progressWorkspace,
  fixedReduceRepositoryName = null,
  plan,
  result,
  pending,
  error,
  onOpenChange,
  onRefreshAuxiliaryCandidates,
  onPreview,
  onConfirm,
  onRetry,
  onCancel,
}: BranchWorkspaceDialogProps) {
  const t = useT()
  const [branch, setBranch] = useState('')
  const [selectedRepositories, setSelectedRepositories] = useState<Record<string, boolean>>({})
  const [baseBranches, setBaseBranches] = useState<Record<string, string>>({})
  const [repositoryBootstraps, setRepositoryBootstraps] = useState<Record<string, RepositoryBootstrapState>>({})
  const [repositoryBootstrapChoices, setRepositoryBootstrapChoices] = useState<
    Record<string, Record<string, WorktreeBootstrapCandidateChoice | undefined>>
  >({})
  const bootstrapControllers = useRef<Record<string, AbortController>>({})
  const [auxiliaryChoices, setAuxiliaryChoices] = useState<Record<string, MaterializationCandidateChoice>>({})
  const [auxiliaryRefreshPending, setAuxiliaryRefreshPending] = useState(false)
  const [auxiliaryRefreshError, setAuxiliaryRefreshError] = useState<string | null>(null)
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
  const initialDialogState = useRef({ workspace, repositories, fixedRepositories })
  initialDialogState.current = { workspace, repositories, fixedRepositories }

  useEffect(() => {
    if (!open) return
    const initial = initialDialogState.current
    setBranch(initial.workspace?.branch ?? '')
    setSelectedRepositories(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          mode === 'reduce'
            ? repository.name === fixedReduceRepositoryName
            : initial.fixedRepositories.has(repository.name),
        ]),
      ),
    )
    setBaseBranches(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          initial.fixedRepositories.get(repository.name)?.baseBranch ||
            repository.defaultBranch ||
            repository.branches[0] ||
            '',
        ]),
      ),
    )
    Object.values(bootstrapControllers.current).forEach((controller) => controller.abort())
    bootstrapControllers.current = {}
    setRepositoryBootstraps({})
    setRepositoryBootstrapChoices({})
    setAuxiliaryChoices({})
    setAuxiliaryRefreshPending(false)
    setAuxiliaryRefreshError(null)
    setAlsoDeleteBranch(mode === 'remove')
    setAlsoDeleteUpstream(false)
    setApprovals([])
  }, [fixedReduceRepositoryName, mode, open, workspace?.id])

  useEffect(() => {
    if (!open) return
    setAuxiliaryChoices((current) =>
      Object.fromEntries(
        auxiliaryCandidates.map((candidate) => [
          candidate.name,
          fixedAuxiliary.get(candidate.name)?.mode ?? current[candidate.name] ?? 'skip',
        ]),
      ),
    )
  }, [auxiliaryCandidates, fixedAuxiliary, open])

  useEffect(() => () => Object.values(bootstrapControllers.current).forEach((controller) => controller.abort()), [])

  useEffect(() => {
    if (plan && (mode === 'create' || mode === 'extend' || mode === 'remove')) {
      setApprovals(plan.requiredApprovals)
      return
    }
    setApprovals([])
  }, [mode, plan?.token])

  const refreshAuxiliaryCandidates = async (closeOnSuccess = false) => {
    if (auxiliaryRefreshPending) return
    setAuxiliaryRefreshPending(true)
    setAuxiliaryRefreshError(null)
    try {
      const response = await onRefreshAuxiliaryCandidates()
      if (!response.ok) setAuxiliaryRefreshError(response.message)
      else if (closeOnSuccess) onOpenChange(false)
    } catch {
      setAuxiliaryRefreshError('workspace.branch-workspace.read-failed')
    } finally {
      setAuxiliaryRefreshPending(false)
    }
  }

  const loadRepositoryBootstrap = async (
    repository: BranchWorkspaceRepositoryOption,
    baseBranch = baseBranches[repository.name] || repository.defaultBranch,
  ) => {
    bootstrapControllers.current[repository.name]?.abort()
    const controller = new AbortController()
    bootstrapControllers.current[repository.name] = controller
    setRepositoryBootstraps((current) => ({ ...current, [repository.name]: { status: 'loading' } }))
    try {
      const result = await getRepositoryWorktreeBootstrapPreflight(
        repository.id,
        controller.signal,
        'all-untracked',
        repository.sourceWorktreeByBranch?.[baseBranch],
      )
      if (controller.signal.aborted) return
      setRepositoryBootstraps((current) => ({
        ...current,
        [repository.name]: result.ok ? { status: 'ready', preflight: result.preflight } : { status: 'error' },
      }))
    } catch {
      if (!controller.signal.aborted) {
        setRepositoryBootstraps((current) => ({ ...current, [repository.name]: { status: 'error' } }))
      }
    } finally {
      if (bootstrapControllers.current[repository.name] === controller) {
        delete bootstrapControllers.current[repository.name]
      }
    }
  }

  const createRequest = (): Extract<BranchWorkspacePlanRequest, { operation: 'create' }> => ({
    operation: 'create',
    branch: branch.trim(),
    repositories: repositories.flatMap((repository) =>
      selectedRepositories[repository.name] ? [repositorySelection(repository)] : [],
    ),
    auxiliaryEntries: auxiliaryCandidates.flatMap((candidate) => {
      const choice = auxiliaryChoices[candidate.name] ?? 'skip'
      return choice === 'skip' ? [] : [{ name: candidate.name, mode: choice }]
    }),
  })
  const repositorySelection = (
    repository: BranchWorkspaceRepositoryOption,
  ): Extract<BranchWorkspacePlanRequest, { operation: 'create' }>['repositories'][number] => {
    const state = repositoryBootstraps[repository.name]
    const selections =
      state?.status === 'ready' && state.preflight.kind === 'candidates'
        ? state.preflight.candidates.flatMap((candidate) => {
            const choice = repositoryBootstrapChoices[repository.name]?.[candidate.path] ?? 'skip'
            return choice === 'skip' ? [] : [{ path: candidate.path, mode: choice }]
          })
        : []
    return {
      repositoryName: repository.name,
      baseBranch: baseBranches[repository.name] || repository.defaultBranch,
      ...(selections.length > 0
        ? {
            worktreeBootstrap: {
              kind: 'materialize' as const,
              candidateScope: 'all-untracked' as const,
              selections,
            },
          }
        : {}),
    }
  }
  const request = (): BranchWorkspacePlanRequest | null => {
    if (mode === 'create' || mode === 'extend') {
      const value = createRequest()
      const hasNewRepository = value.repositories.some(
        (repository) => !fixedRepositories.has(repository.repositoryName),
      )
      return value.branch && value.repositories.length > 0 && (mode === 'create' || hasNewRepository) ? value : null
    }
    if (!workspace) return null
    if (mode === 'repair') return { operation: 'repair', branchWorkspaceId: workspace.id }
    if (mode === 'reduce') {
      const selected = workspace.repositories.flatMap((member) =>
        selectedRepositories[member.repositoryName] ? [member.repositoryName] : [],
      )
      return selected.length > 0 && selected.length < workspace.repositories.length
        ? { operation: 'reduce', branchWorkspaceId: workspace.id, repositories: selected }
        : null
    }
    return {
      operation: 'remove',
      branchWorkspaceId: workspace.id,
      alsoDeleteBranch,
      alsoDeleteUpstream: alsoDeleteBranch && alsoDeleteUpstream,
    }
  }
  const removalExecutionLocked = mode === 'remove' && plan !== null && pending
  const close = () => {
    if (removalExecutionLocked) return
    if (pending) void onCancel()
    onOpenChange(false)
  }
  const run = async (
    action: (confirmedApprovals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>,
  ) => {
    const response = await action(approvals)
    if (response?.ok) onOpenChange(false)
  }
  const requiredApprovalsSatisfied = !plan || plan.requiredApprovals.every((approval) => approvals.includes(approval))
  const destructiveConfirm = mode === 'reduce' || mode === 'remove'
  const repositoryBootstrapPending = repositories.some(
    (repository) =>
      selectedRepositories[repository.name] &&
      !fixedRepositories.has(repository.name) &&
      repositoryBootstraps[repository.name]?.status !== 'ready',
  )
  const operationProgress =
    plan && plan.steps.length > 0 && (mode === 'create' || mode === 'remove') && (pending || result !== null)
      ? projectBranchWorkspaceOperationProgress(plan, progressWorkspace, {
          executing: pending,
          failed: !pending && result?.ok === false,
        })
      : null
  const progressStatusByStepId = new Map(operationProgress?.steps.map((item) => [item.step.id, item.status]))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && removalExecutionLocked) return
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!removalExecutionLocked}
        onEscapeKeyDown={(event) => {
          if (removalExecutionLocked) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (removalExecutionLocked) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`workspace.branch-workspace.dialog.${mode}.title`)}</DialogTitle>
          <DialogDescription>{t(`workspace.branch-workspace.dialog.${mode}.description`)}</DialogDescription>
        </DialogHeader>

        {!plan && (mode === 'create' || mode === 'extend') ? (
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
              {repositories
                .filter((repository) => mode !== 'extend' || !fixedRepositories.has(repository.name))
                .map((repository) => {
                  const fixed = fixedRepositories.has(repository.name)
                  const bootstrap = repositoryBootstraps[repository.name]
                  return (
                    <div key={repository.name} className="grid gap-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] gap-3">
                        <label className={cn('flex items-center gap-2 text-xs', !repository.available && 'opacity-60')}>
                          <input
                            type="checkbox"
                            aria-label={t('workspace.branch-workspace.repository-named', { name: repository.name })}
                            checked={selectedRepositories[repository.name] === true}
                            disabled={pending || fixed || !repository.available}
                            onChange={(event) => {
                              setSelectedRepositories((current) => ({
                                ...current,
                                [repository.name]: event.target.checked,
                              }))
                              if (event.target.checked) void loadRepositoryBootstrap(repository)
                              else bootstrapControllers.current[repository.name]?.abort()
                            }}
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
                          onChange={(event) => {
                            const baseBranch = event.target.value
                            setBaseBranches((current) => ({ ...current, [repository.name]: baseBranch }))
                            setRepositoryBootstrapChoices((current) => ({
                              ...current,
                              [repository.name]: {},
                            }))
                            void loadRepositoryBootstrap(repository, baseBranch)
                          }}
                        >
                          {repository.branches.map((candidate) => (
                            <option key={candidate} value={candidate}>
                              {candidate}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedRepositories[repository.name] && !fixed ? (
                        <div className="pl-6">
                          {bootstrap?.status === 'loading' ? (
                            <p className="text-xs text-muted-foreground" role="status">
                              {t('workspace.branch-workspace.repository-dependencies-loading')}
                            </p>
                          ) : null}
                          {bootstrap?.status === 'error' ? (
                            <p className="text-xs text-muted-foreground" role="status">
                              {t('workspace.branch-workspace.repository-dependencies-error')}
                            </p>
                          ) : null}
                          {bootstrap?.status === 'ready' && bootstrap.preflight.candidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {t('workspace.branch-workspace.repository-dependencies-empty')}
                            </p>
                          ) : null}
                          {bootstrap?.status === 'ready' && bootstrap.preflight.candidates.length > 0 ? (
                            <WorktreeBootstrapCandidateList
                              headingId={`branch-workspace-repository-dependencies-${repository.name}`}
                              label={t('workspace.branch-workspace.repository-dependencies')}
                              description={t('workspace.branch-workspace.repository-dependencies-description')}
                              candidates={bootstrap.preflight.candidates}
                              choices={repositoryBootstrapChoices[repository.name] ?? {}}
                              disabled={pending}
                              onChoiceChange={(candidatePath, choice) =>
                                setRepositoryBootstrapChoices((current) => ({
                                  ...current,
                                  [repository.name]: {
                                    ...current[repository.name],
                                    [candidatePath]: choice,
                                  },
                                }))
                              }
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
            </fieldset>
            {mode === 'create' ? (
              <MaterializationCandidateList
                items={auxiliaryCandidates.map((candidate) => {
                  const fixed = fixedAuxiliary.has(candidate.name)
                  return {
                    id: candidate.name,
                    label: candidate.name,
                    kind: candidate.kind === 'directory' ? 'directory' : 'file',
                    disabled: fixed,
                    annotation: (
                      <>
                        {candidate.outsideRoot ? (
                          <span className="shrink-0 text-[10px] text-warning">
                            {t('workspace.branch-workspace.outside-root')}
                          </span>
                        ) : null}
                        {fixed ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {t('workspace.branch-workspace.member-fixed')}
                          </span>
                        ) : null}
                      </>
                    ),
                  }
                })}
                choices={auxiliaryChoices}
                onChoiceChange={(name, choice) => setAuxiliaryChoices((current) => ({ ...current, [name]: choice }))}
                headingId="branch-workspace-auxiliary-candidates"
                label={t('workspace.branch-workspace.auxiliary')}
                emptyMessage={t('workspace.branch-workspace.auxiliary-empty')}
                headerAction={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('workspace.branch-workspace.auxiliary-refresh')}
                    title={t('workspace.branch-workspace.auxiliary-refresh')}
                    disabled={pending || auxiliaryRefreshPending}
                    onClick={() => void refreshAuxiliaryCandidates()}
                  >
                    <RefreshCw className={cn(auxiliaryRefreshPending && 'animate-spin')} aria-hidden="true" />
                  </Button>
                }
                disabled={pending}
              />
            ) : null}
            {mode === 'create' && auxiliaryRefreshError ? (
              <p className="text-xs text-danger" role="alert">
                {t(auxiliaryRefreshError)}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'repair' && auxiliaryRefreshError ? (
          <p className="text-xs text-danger" role="alert">
            {t(auxiliaryRefreshError)}
          </p>
        ) : null}

        {!plan && mode === 'reduce' && workspace ? (
          <div className="grid gap-3">
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
              {t('workspace.branch-workspace.reduce-retains-branches')}
            </p>
            <fieldset className="grid gap-2 rounded-md border border-separator p-3">
              <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.repositories')}</legend>
              {workspace.repositories.map((member) => (
                <label key={member.repositoryName} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    data-branch-workspace-reduce-member={member.repositoryName}
                    aria-label={t('workspace.branch-workspace.repository-named', { name: member.repositoryName })}
                    checked={selectedRepositories[member.repositoryName] === true}
                    disabled={pending || fixedReduceRepositoryName !== null}
                    onChange={(event) =>
                      setSelectedRepositories((current) => ({
                        ...current,
                        [member.repositoryName]: event.target.checked,
                      }))
                    }
                  />
                  <span className="truncate font-medium">{member.repositoryName}</span>
                </label>
              ))}
            </fieldset>
          </div>
        ) : null}

        {!plan && mode === 'remove' ? (
          <div className="grid gap-2 rounded-md border border-danger-border bg-danger-surface p-3 text-xs">
            <p>{t('workspace.branch-workspace.delete-warning')}</p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={t('workspace.branch-workspace.delete-local-branch')}
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
                aria-label={t('workspace.branch-workspace.delete-upstream-branch')}
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
            {operationProgress ? (
              <div
                data-branch-workspace-operation-progress
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-md border border-separator bg-muted/20 px-3 py-2 text-xs"
              >
                {pending ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin text-foreground" aria-hidden="true" />
                ) : result?.ok === false ? (
                  <X className="size-4 shrink-0 text-danger" aria-hidden="true" />
                ) : (
                  <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                )}
                <span className="font-medium">
                  {t(`workspace.branch-workspace.progress.${mode === 'create' ? 'create' : 'remove'}`)}
                </span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {t('workspace.branch-workspace.progress.summary', {
                    completed: operationProgress.completedCount,
                    total: operationProgress.totalCount,
                  })}
                </span>
              </div>
            ) : null}
            <div className="rounded-md border border-separator">
              {plan.steps.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">{t('workspace.branch-workspace.no-pending-steps')}</p>
              ) : (
                groupBranchCleanupSteps(plan.steps).map((item) => {
                  if (item.kind === 'branch-group') {
                    return (
                      <div
                        key={item.steps.map((step) => step.id).join(':')}
                        data-branch-workspace-branch-group={item.repositoryName}
                        role="group"
                        aria-label={item.repositoryName}
                        className="border-b border-separator/60 bg-muted/10 px-3 py-2.5 text-xs last:border-b-0"
                      >
                        <div
                          className={cn(
                            'grid gap-2',
                            item.steps.length > 1 && 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center',
                          )}
                        >
                          {item.steps.map((step, index) => (
                            <div key={step.id} className="contents">
                              {index > 0 ? (
                                <ArrowRight
                                  className="mx-auto size-3.5 rotate-90 text-muted-foreground/70 sm:rotate-0"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <div
                                data-branch-workspace-progress-step={step.id}
                                data-progress-status={progressStatusByStepId.get(step.id)}
                                className="grid min-w-0 gap-1"
                              >
                                <BranchCleanupStepLabel step={step} />
                                {progressStatusByStepId.get(step.id) ? (
                                  <PlanStepProgressStatus status={progressStatusByStepId.get(step.id)!} />
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  const { step } = item
                  return (
                    <div
                      key={step.id}
                      data-branch-workspace-plan-step={step.kind}
                      data-branch-workspace-progress-step={step.id}
                      data-progress-status={progressStatusByStepId.get(step.id)}
                      className={cn(
                        'flex items-center justify-between gap-3 border-b border-separator/60 px-3 py-2 text-xs last:border-b-0',
                        mode === 'create' &&
                          step.kind === 'create-directory' &&
                          'bg-success-surface font-semibold text-success',
                        mode === 'remove' &&
                          step.kind === 'remove-directory' &&
                          'bg-danger-surface font-semibold text-danger',
                      )}
                    >
                      <span>{step.label}</span>
                      {progressStatusByStepId.get(step.id) ? (
                        <PlanStepProgressStatus status={progressStatusByStepId.get(step.id)!} />
                      ) : null}
                    </div>
                  )
                })
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
          {mode === 'repair' ? (
            <Button
              type="button"
              variant="outline"
              data-action="clear-cache"
              disabled={pending || auxiliaryRefreshPending}
              onClick={() => void refreshAuxiliaryCandidates(true)}
            >
              <RefreshCw className={cn(auxiliaryRefreshPending && 'animate-spin')} aria-hidden="true" />
              {t('error.clear-cache')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={removalExecutionLocked} onClick={close}>
            {t('dialog.cancel')}
          </Button>
          {!plan ? (
            <Button
              type="button"
              data-action="preview"
              disabled={pending || repositoryBootstrapPending || request() === null}
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
              variant={destructiveConfirm ? 'destructive' : 'default'}
              disabled={pending || !requiredApprovalsSatisfied}
              onClick={() => void run(onConfirm)}
            >
              {operationProgress && pending && result === null ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
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
              {operationProgress && pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t('workspace.branch-workspace.retry')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanStepProgressStatus({ status }: { status: BranchWorkspaceStepProgressStatus }) {
  const t = useT()
  const icon =
    status === 'active' ? (
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
    ) : status === 'complete' ? (
      <Check className="size-3.5" aria-hidden="true" />
    ) : status === 'failed' ? (
      <X className="size-3.5" aria-hidden="true" />
    ) : (
      <Circle className="size-3.5" aria-hidden="true" />
    )
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 text-[10px] font-medium',
        status === 'active' && 'text-foreground',
        status === 'complete' && 'text-success',
        status === 'failed' && 'text-danger',
        status === 'pending' && 'text-muted-foreground',
      )}
    >
      {icon}
      {t(`workspace.branch-workspace.progress.${status}`)}
    </span>
  )
}

function BranchCleanupStepLabel({ step }: { step: BranchCleanupStep }) {
  const t = useT()
  const labelKey =
    step.kind === 'delete-local-branch'
      ? 'workspace.branch-workspace.step.local-branch'
      : 'workspace.branch-workspace.step.upstream-branch'

  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">{t(labelKey)}</span>
      <span className="break-all font-mono text-foreground" title={step.label}>
        {step.label}
      </span>
    </div>
  )
}

type BranchCleanupStep = BranchWorkspacePlanStep & {
  kind: 'delete-local-branch' | 'delete-upstream-branch'
  repositoryName: string
}

type PlanStepDisplayItem =
  | { kind: 'step'; step: BranchWorkspacePlanStep }
  | { kind: 'branch-group'; repositoryName: string; steps: BranchCleanupStep[] }

function groupBranchCleanupSteps(steps: BranchWorkspacePlanStep[]): PlanStepDisplayItem[] {
  const items: PlanStepDisplayItem[] = []
  for (const step of steps) {
    if (!isBranchCleanupStep(step)) {
      items.push({ kind: 'step', step })
      continue
    }

    const previous = items.at(-1)
    if (previous?.kind === 'branch-group' && previous.repositoryName === step.repositoryName) {
      previous.steps.push(step)
    } else {
      items.push({ kind: 'branch-group', repositoryName: step.repositoryName, steps: [step] })
    }
  }
  return items
}

function isBranchCleanupStep(step: BranchWorkspacePlanStep): step is BranchCleanupStep {
  return !!step.repositoryName && (step.kind === 'delete-local-branch' || step.kind === 'delete-upstream-branch')
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
