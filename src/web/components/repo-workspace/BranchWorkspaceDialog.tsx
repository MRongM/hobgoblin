import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  ClipboardList,
  FolderKanban,
  FolderPlus,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceAuxiliaryCandidate,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlan,
  BranchWorkspaceRepositoryPlan,
  BranchWorkspacePlanRequest,
  BranchWorkspacePlanStep,
  BranchWorkspaceReadResult,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { isRemoteTrackingRef, type WorktreeCreationBase, worktreeCreationBaseRef } from '#/shared/worktree-create.ts'
import { BranchPrefixPicker } from '#/web/components/branch-list/BranchPrefixPicker.tsx'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'
import { remoteRefMatchesQuery } from '#/web/components/branch-list/branch-create-model.ts'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { BranchWorkspaceRepositoryDependencySelection } from '#/web/components/repo-workspace/BranchWorkspaceRepositoryDependencySelection.tsx'
import {
  projectBranchWorkspaceOperationProgress,
  type BranchWorkspaceStepProgressStatus,
} from '#/web/components/repo-workspace/branch-workspace-operation-progress.ts'
import {
  repositoryDependencySources,
  type RepositoryDependencySource,
  type RepositoryDependencyWorktree,
} from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import {
  OneStepPlanningLayout,
  OneStepPlanningPlanPane,
  OneStepPlanningSelectionPane,
} from '#/web/components/repo-workspace/OneStepPlanningLayout.tsx'
import type { BranchWorkspaceRepositoryFetchResult } from '#/web/branch-workspace-repository-fetch.ts'
import {
  showWorkspaceRepositoryFetchError,
  showWorkspaceRepositoryFetchResult,
} from '#/web/components/repo-workspace/workspace-repository-fetch-feedback.ts'
import { useLatestPlanRequest } from '#/web/hooks/useLatestPlanRequest.ts'

export interface BranchWorkspaceRepositoryOption {
  id: string
  name: string
  available: boolean
  branches: string[]
  defaultBranch: string
  branchDetails?: Record<string, { tracking?: string; trackingGone?: boolean }>
  worktrees?: RepositoryDependencyWorktree[]
}

type RemoteBranchesState =
  | { status: 'loading'; branches: string[] }
  | { status: 'ready'; branches: string[] }
  | { status: 'error'; branches: string[] }

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
  executing?: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onFetchAllRepositories: () => Promise<BranchWorkspaceRepositoryFetchResult>
  onRefreshAuxiliaryCandidates: () => Promise<BranchWorkspaceReadResult>
  plannedRequest?: BranchWorkspacePlanRequest | null
  onPreview: (request: BranchWorkspacePlanRequest, signal?: AbortSignal) => Promise<unknown>
  onConfirm: (approvals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>
  onForceConfirm: (approvals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>
  onRetry: (approvals: BranchWorkspaceApproval[]) => Promise<BranchWorkspaceExecuteResult | null>
  onReturnToSelection: () => Promise<void> | void
  onCancel: () => Promise<unknown>
}

function defaultBranchWorkspaceName(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `feat/${year}${month}${day}`
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
  executing = pending,
  error,
  onOpenChange,
  onFetchAllRepositories,
  onRefreshAuxiliaryCandidates,
  onPreview,
  plannedRequest,
  onConfirm,
  onForceConfirm,
  onRetry,
  onReturnToSelection,
  onCancel,
}: BranchWorkspaceDialogProps) {
  const t = useT()
  const [branch, setBranch] = useState('')
  const [selectedRepositories, setSelectedRepositories] = useState<Record<string, boolean>>({})
  const [repositoryDependenciesEnabled, setRepositoryDependenciesEnabled] = useState<Record<string, boolean>>({})
  const [creationBases, setCreationBases] = useState<Record<string, WorktreeCreationBase>>({})
  const [syncBeforeCreate, setSyncBeforeCreate] = useState<Record<string, boolean>>({})
  const [remoteBranches, setRemoteBranches] = useState<Record<string, RemoteBranchesState>>({})
  const [repositoryBootstrapSources, setRepositoryBootstrapSources] = useState<
    Record<string, RepositoryDependencySource | undefined>
  >({})
  const [repositoryBootstrapSelections, setRepositoryBootstrapSelections] = useState<
    Record<string, WorktreeBootstrapSelection[] | undefined>
  >({})
  const [repositoryDependencyReadPending, setRepositoryDependencyReadPending] = useState<Record<string, boolean>>({})
  const remoteBranchControllers = useRef<Record<string, AbortController>>({})
  const [repositoryBranchQueries, setRepositoryBranchQueries] = useState<Record<string, string>>({})
  const [auxiliaryChoices, setAuxiliaryChoices] = useState<Record<string, MaterializationCandidateChoice>>({})
  const [auxiliaryRefreshPending, setAuxiliaryRefreshPending] = useState(false)
  const [auxiliaryRefreshError, setAuxiliaryRefreshError] = useState<string | null>(null)
  const [fetchAllPending, setFetchAllPending] = useState(false)
  const [alsoDeleteBranch, setAlsoDeleteBranch] = useState(false)
  const [alsoDeleteUpstream, setAlsoDeleteUpstream] = useState(false)
  const [approvals, setApprovals] = useState<BranchWorkspaceApproval[]>([])
  const [planRevision, setPlanRevision] = useState(0)
  const [planNotBefore, setPlanNotBefore] = useState(0)
  const dialogStateKey = open ? JSON.stringify([mode, workspace?.id ?? null, fixedReduceRepositoryName]) : null
  const [initializedDialogStateKey, setInitializedDialogStateKey] = useState<string | null>(null)
  const oneStep = mode === 'create' || mode === 'extend' || mode === 'reduce' || mode === 'remove'
  const operationConsole = mode === 'create' || mode === 'remove'
  const operationTone = mode === 'remove' ? 'destructive' : 'constructive'
  const selectionDescriptionKey =
    mode === 'remove'
      ? 'workspace.branch-workspace.one-step.selection-description.remove'
      : 'workspace.branch-workspace.one-step.selection-description.create'
  const planDescriptionKey =
    mode === 'remove'
      ? 'workspace.branch-workspace.one-step.plan-description.remove'
      : 'workspace.branch-workspace.one-step.plan-description.create'
  const selectionLocked = oneStep ? executing || result !== null : pending

  const fixedRepositories = useMemo(
    () =>
      new Map(
        workspace?.repositories
          .filter((member) => member.progress === 'complete')
          .map((member) => [member.repositoryName, member]) ?? [],
      ),
    [workspace],
  )
  const fixedAuxiliary = useMemo(
    () =>
      new Map(
        workspace?.auxiliaryEntries
          .filter((entry) => entry.progress === 'complete')
          .map((entry) => [entry.name, entry]) ?? [],
      ),
    [workspace],
  )
  const initialDialogState = useRef({ workspace, repositories, fixedRepositories })
  initialDialogState.current = { workspace, repositories, fixedRepositories }

  useEffect(() => {
    if (!open) {
      setInitializedDialogStateKey(null)
      return
    }
    const initial = initialDialogState.current
    const initialBranch = initial.workspace?.branch ?? (mode === 'create' ? defaultBranchWorkspaceName() : '')
    const initialBases = Object.fromEntries(
      initial.repositories.map((repository) => [
        repository.name,
        initial.fixedRepositories.get(repository.name)?.creationBase ?? defaultCreationBase(repository),
      ]),
    )
    setBranch(initialBranch)
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
    setRepositoryDependenciesEnabled({})
    setCreationBases(initialBases)
    setSyncBeforeCreate(
      Object.fromEntries(
        initial.repositories.map((repository) => {
          const fixed = initial.fixedRepositories.get(repository.name)
          return [
            repository.name,
            fixed?.syncBeforeCreate ??
              syncEligible(
                repository,
                effectiveCreationBase(repository, initialBranch, initialBases[repository.name]!),
              ),
          ]
        }),
      ),
    )
    Object.values(remoteBranchControllers.current).forEach((controller) => controller.abort())
    remoteBranchControllers.current = {}
    setRemoteBranches({})
    setRepositoryBootstrapSources({})
    setRepositoryBootstrapSelections({})
    setRepositoryDependencyReadPending({})
    setRepositoryBranchQueries({})
    setAuxiliaryChoices({})
    setAuxiliaryRefreshPending(false)
    setAuxiliaryRefreshError(null)
    setAlsoDeleteBranch(mode === 'remove')
    setAlsoDeleteUpstream(false)
    setApprovals([])
    setPlanRevision(0)
    setPlanNotBefore(0)
    setInitializedDialogStateKey(dialogStateKey)
  }, [dialogStateKey, fixedReduceRepositoryName, mode, open, workspace?.id])

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

  useEffect(
    () => () => {
      Object.values(remoteBranchControllers.current).forEach((controller) => controller.abort())
    },
    [],
  )

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
      if (!closeOnSuccess) setPlanRevision((current) => current + 1)
    }
  }

  const clearRepositoryBootstrap = (repositoryName: string) => {
    setRepositoryBootstrapSources((current) => {
      const next = { ...current }
      delete next[repositoryName]
      return next
    })
    setRepositoryBootstrapSelections((current) => {
      const next = { ...current }
      delete next[repositoryName]
      return next
    })
    setRepositoryDependencyReadPending((current) => {
      if (current[repositoryName] === undefined) return current
      const next = { ...current }
      delete next[repositoryName]
      return next
    })
  }

  const loadRemoteBranches = async (repository: BranchWorkspaceRepositoryOption) => {
    remoteBranchControllers.current[repository.name]?.abort()
    const controller = new AbortController()
    remoteBranchControllers.current[repository.name] = controller
    const previous = remoteBranches[repository.name]?.branches ?? []
    setRemoteBranches((current) => ({
      ...current,
      [repository.name]: { status: 'loading', branches: current[repository.name]?.branches ?? [] },
    }))
    try {
      const branches = await getRepositoryRemoteBranches(repository.id, controller.signal)
      if (!controller.signal.aborted) {
        setRemoteBranches((current) => ({
          ...current,
          [repository.name]: { status: 'ready', branches },
        }))
      }
    } catch {
      if (!controller.signal.aborted) {
        setRemoteBranches((current) => ({
          ...current,
          [repository.name]: { status: 'error', branches: previous },
        }))
      }
    } finally {
      if (remoteBranchControllers.current[repository.name] === controller) {
        delete remoteBranchControllers.current[repository.name]
      }
    }
  }

  const fetchAllRepositories = async () => {
    if (fetchAllPending) return
    setFetchAllPending(true)
    try {
      const summary = await onFetchAllRepositories()
      showWorkspaceRepositoryFetchResult(t, summary)
      void Promise.allSettled(
        repositories
          .filter((repository) => repository.available && selectedRepositories[repository.name])
          .map(loadRemoteBranches),
      )
    } catch (fetchError) {
      showWorkspaceRepositoryFetchError(t, repositories.length, fetchError)
    } finally {
      setFetchAllPending(false)
      setPlanRevision((current) => current + 1)
    }
  }

  const applyBranchChange = (nextBranch: string) => {
    setPlanNotBefore(Date.now() + 300)
    setBranch(nextBranch)
    setSyncBeforeCreate((current) =>
      Object.fromEntries(
        repositories.map((repository) => {
          const fixed = fixedRepositories.get(repository.name)
          if (fixed) return [repository.name, fixed.syncBeforeCreate]
          const requestedBase = creationBases[repository.name] ?? defaultCreationBase(repository)
          const previousBase = effectiveCreationBase(repository, branch.trim(), requestedBase)
          const nextBase = effectiveCreationBase(repository, nextBranch.trim(), requestedBase)
          return [
            repository.name,
            sameCreationBase(previousBase, nextBase)
              ? (current[repository.name] ?? syncEligible(repository, nextBase))
              : syncEligible(repository, nextBase),
          ]
        }),
      ),
    )
    for (const repository of repositories) {
      if (!repositoryDependenciesEnabled[repository.name]) continue
      const base = effectiveCreationBase(
        repository,
        nextBranch.trim(),
        creationBases[repository.name] ?? defaultCreationBase(repository),
      )
      initializeRepositoryBootstrap(repository, base)
    }
  }

  const initializeRepositoryBootstrap = (
    repository: BranchWorkspaceRepositoryOption,
    creationBase = effectiveCreationBase(
      repository,
      branch.trim(),
      creationBases[repository.name] ?? defaultCreationBase(repository),
    ),
  ) => {
    const sources = repositoryDependencySources({
      contextBranch: creationBase.kind === 'localBranch' ? creationBase.branch : '',
      worktrees: repository.worktrees ?? [],
    })
    setRepositoryDependencyReadPending((current) => ({
      ...current,
      [repository.name]: sources.initial !== null,
    }))
    setRepositoryBootstrapSources((current) => ({
      ...current,
      [repository.name]: sources.initial ?? undefined,
    }))
    setRepositoryBootstrapSelections((current) => ({ ...current, [repository.name]: [] }))
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
    const fixed = fixedRepositories.get(repository.name)
    const creationBase =
      fixed?.creationBase ??
      effectiveCreationBase(
        repository,
        branch.trim(),
        creationBases[repository.name] ?? defaultCreationBase(repository),
      )
    const dependencySource = repositoryDependenciesEnabled[repository.name]
      ? repositoryBootstrapSources[repository.name]
      : undefined
    const selections = repositoryDependenciesEnabled[repository.name]
      ? (repositoryBootstrapSelections[repository.name] ?? [])
      : []
    return {
      repositoryName: repository.name,
      creationBase,
      syncBeforeCreate:
        fixed?.syncBeforeCreate ??
        (syncBeforeCreate[repository.name] === true && syncEligible(repository, creationBase)),
      ...(dependencySource && selections.length > 0
        ? {
            worktreeBootstrap: {
              kind: 'materialize' as const,
              sourceWorktreePath: dependencySource.worktreePath,
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
      const hasNewAuxiliaryEntry = value.auxiliaryEntries.some((entry) => !fixedAuxiliary.has(entry.name))
      return value.branch && value.repositories.length > 0 && (!workspace || hasNewRepository || hasNewAuxiliaryEntry)
        ? value
        : null
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
  const currentRequest =
    open &&
    oneStep &&
    dialogStateKey !== null &&
    initializedDialogStateKey === dialogStateKey &&
    !executing &&
    result === null
      ? request()
      : null
  const currentRequestKey = currentRequest ? JSON.stringify(currentRequest) : null
  const plannedRequestKey = plannedRequest ? JSON.stringify(plannedRequest) : null
  const dependencyReadPending = repositories.some(
    (repository) =>
      selectedRepositories[repository.name] &&
      repositoryDependenciesEnabled[repository.name] &&
      repositoryDependencyReadPending[repository.name],
  )
  const autoPlan = useLatestPlanRequest({
    enabled: open && oneStep && !fetchAllPending && !auxiliaryRefreshPending && !dependencyReadPending,
    request: currentRequest,
    requestKey: currentRequestKey,
    revision: planRevision,
    notBefore: planNotBefore,
    requestPlan: async (nextRequest, signal) => (await onPreview(nextRequest, signal)) !== false,
  })
  const currentPlanReady =
    plan !== null &&
    (!oneStep ||
      plannedRequest === undefined ||
      (autoPlan.status === 'ready' && currentRequestKey !== null && plannedRequestKey === currentRequestKey))
  const displayedPlan =
    plan &&
    (!oneStep ||
      plannedRequest === undefined ||
      executing ||
      (autoPlan.status === 'ready' && currentRequestKey !== null && plannedRequestKey === currentRequestKey))
      ? plan
      : null
  const removalExecutionLocked = mode === 'remove' && plan !== null && executing
  const close = () => {
    if (removalExecutionLocked) return
    if (oneStep ? executing : pending) void onCancel()
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
  const visibleRepositories = repositories.filter(
    (repository) => mode !== 'extend' || !fixedRepositories.has(repository.name),
  )
  const selectableRepositories = visibleRepositories.filter(
    (repository) => repository.available && !fixedRepositories.has(repository.name),
  )
  const selectedSelectableCount = selectableRepositories.filter(
    (repository) => selectedRepositories[repository.name],
  ).length
  const allSelectableRepositoriesSelected =
    selectableRepositories.length > 0 && selectedSelectableCount === selectableRepositories.length
  const someSelectableRepositoriesSelected = selectedSelectableCount > 0 && !allSelectableRepositoriesSelected
  const synchronizableSelectedRepositories = visibleRepositories.filter((repository) => {
    if (!repository.available || fixedRepositories.has(repository.name) || !selectedRepositories[repository.name]) {
      return false
    }
    const creationBase = effectiveCreationBase(
      repository,
      branch.trim(),
      creationBases[repository.name] ?? defaultCreationBase(repository),
    )
    return syncEligible(repository, creationBase)
  })
  const synchronizedSelectedCount = synchronizableSelectedRepositories.filter(
    (repository) => syncBeforeCreate[repository.name],
  ).length
  const allSynchronizableSelectedRepositoriesSynchronized =
    synchronizableSelectedRepositories.length > 0 &&
    synchronizedSelectedCount === synchronizableSelectedRepositories.length
  const someSynchronizableSelectedRepositoriesSynchronized =
    synchronizedSelectedCount > 0 && !allSynchronizableSelectedRepositoriesSynchronized
  const operationPending = oneStep ? executing : pending
  const operationProgress =
    plan && plan.steps.length > 0 && (mode === 'create' || mode === 'remove') && (operationPending || result !== null)
      ? projectBranchWorkspaceOperationProgress(plan, progressWorkspace, {
          executing: operationPending,
          failed: !operationPending && result?.ok === false,
        })
      : null
  const progressStatusByStepId = new Map(operationProgress?.steps.map((item) => [item.step.id, item.status]))
  const creationCompletedDespiteRemoteReadFailure =
    mode === 'create' &&
    !operationPending &&
    result?.ok === false &&
    (result.message === 'workspace.branch-workspace.remote-operation-failed' ||
      result.message === 'workspace.branch-workspace.remote-invalid-response') &&
    progressWorkspace?.state.kind === 'ready' &&
    operationProgress !== null &&
    operationProgress.totalCount > 0 &&
    operationProgress.completedCount === operationProgress.totalCount

  useEffect(() => {
    if (open && creationCompletedDespiteRemoteReadFailure) onOpenChange(false)
  }, [creationCompletedDespiteRemoteReadFailure, onOpenChange, open])

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
        className={cn(
          'max-h-[85vh]',
          oneStep ? 'grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl' : 'overflow-y-auto sm:max-w-2xl',
        )}
        showCloseButton={!removalExecutionLocked}
        onEscapeKeyDown={(event) => {
          if (removalExecutionLocked) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (removalExecutionLocked) event.preventDefault()
        }}
      >
        <DialogHeader
          data-branch-workspace-operation-header={operationConsole ? '' : undefined}
          data-tone={operationConsole ? operationTone : undefined}
          className={cn(
            'pr-8',
            operationConsole && '-mx-4 -mt-4 rounded-t-lg border-b px-4 py-3.5 pr-12',
            operationConsole && operationTone === 'constructive' && 'border-success-border/70 bg-success-surface/50',
            operationConsole && operationTone === 'destructive' && 'border-danger-border/70 bg-danger-surface/50',
          )}
        >
          <div className="flex items-start gap-3">
            {operationConsole ? (
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-md border bg-card/80 shadow-xs',
                  operationTone === 'constructive' && 'border-success-border text-success',
                  operationTone === 'destructive' && 'border-danger-border text-danger',
                )}
                aria-hidden="true"
              >
                {mode === 'create' ? <FolderPlus className="size-4" /> : <Trash2 className="size-4" />}
              </div>
            ) : null}
            <div className="grid min-w-0 flex-1 gap-2">
              <DialogTitle className={cn(operationConsole && 'text-base')}>
                {t(`workspace.branch-workspace.dialog.${mode}.title`)}
              </DialogTitle>
              <DialogDescription className={cn(operationConsole && 'text-xs leading-relaxed')}>
                {t(`workspace.branch-workspace.dialog.${mode}.description`)}
              </DialogDescription>
            </div>
            {mode === 'create' && (oneStep || !plan) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="fetch-all-repositories"
                aria-label={t('workspace.branch-workspace.fetch-all')}
                disabled={executing || fetchAllPending || repositories.length === 0}
                onClick={() => void fetchAllRepositories()}
              >
                {fetchAllPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {t('workspace.branch-workspace.fetch-all')}
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <OneStepPlanningLayout
          enabled={oneStep}
          testIdPrefix="branch-workspace"
          presentation={operationConsole ? 'operation-console' : 'plain'}
          tone={operationTone}
        >
          <OneStepPlanningSelectionPane
            enabled={oneStep}
            testIdPrefix="branch-workspace"
            title={t('workspace.branch-workspace.one-step.selection-title')}
            description={operationConsole ? t(selectionDescriptionKey) : undefined}
            presentation={operationConsole ? 'operation-console' : 'plain'}
            tone={operationTone}
            step={operationConsole ? '01' : undefined}
          >
            {oneStep && (mode === 'create' || mode === 'extend') ? (
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-xs font-medium">
                  {t('workspace.branch-workspace.branch')}
                  <div className="flex gap-2">
                    <BranchPrefixPicker
                      value={branch}
                      disabled={selectionLocked || !!workspace}
                      onChange={(nextBranch) => applyBranchChange(nextBranch)}
                    />
                    <Input
                      aria-label={t('workspace.branch-workspace.branch')}
                      value={branch}
                      disabled={selectionLocked || !!workspace}
                      className="font-mono flex-1 min-w-0"
                      onChange={(event) => applyBranchChange(event.target.value)}
                    />
                  </div>
                </label>
                <fieldset className="grid gap-2 rounded-md border border-separator p-3">
                  <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.repositories')}</legend>
                  <div className="grid grid-cols-1 gap-3 border-b border-separator pb-2 text-xs font-medium sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.55fr)_minmax(8rem,0.8fr)_minmax(7rem,0.6fr)]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        ref={(element) => {
                          if (element) element.indeterminate = someSelectableRepositoriesSelected
                        }}
                        aria-label={t('workspace.branch-workspace.repositories-select-all')}
                        checked={allSelectableRepositoriesSelected}
                        disabled={selectionLocked || selectableRepositories.length === 0}
                        onChange={() => {
                          const selected = !allSelectableRepositoriesSelected
                          const selectableNames = new Set(selectableRepositories.map((repository) => repository.name))
                          setSelectedRepositories((current) => ({
                            ...current,
                            ...Object.fromEntries([...selectableNames].map((name) => [name, selected])),
                          }))
                          for (const repository of selectableRepositories) {
                            if (selected) {
                              void loadRemoteBranches(repository)
                              continue
                            }
                            setRepositoryDependenciesEnabled((current) => ({
                              ...current,
                              [repository.name]: false,
                            }))
                            clearRepositoryBootstrap(repository.name)
                            remoteBranchControllers.current[repository.name]?.abort()
                          }
                        }}
                      />
                      <span>{t('workspace.branch-workspace.repositories-select-all')}</span>
                    </label>
                    <label className="flex items-center gap-2 text-muted-foreground sm:col-start-4">
                      <input
                        type="checkbox"
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = someSynchronizableSelectedRepositoriesSynchronized
                          }
                        }}
                        aria-label={t('workspace.branch-workspace.sync-before-create-select-all')}
                        checked={allSynchronizableSelectedRepositoriesSynchronized}
                        disabled={selectionLocked || synchronizableSelectedRepositories.length === 0}
                        onChange={() => {
                          const synchronized = !allSynchronizableSelectedRepositoriesSynchronized
                          setSyncBeforeCreate((current) => ({
                            ...current,
                            ...Object.fromEntries(
                              synchronizableSelectedRepositories.map((repository) => [repository.name, synchronized]),
                            ),
                          }))
                        }}
                      />
                      <span className="truncate">{t('workspace.branch-workspace.sync-before-create')}</span>
                    </label>
                  </div>
                  {visibleRepositories.map((repository) => {
                    const fixed = fixedRepositories.has(repository.name)
                    const requestedCreationBase = creationBases[repository.name] ?? defaultCreationBase(repository)
                    const creationBase = effectiveCreationBase(repository, branch.trim(), requestedCreationBase)
                    const dependencySources = repositoryDependencySources({
                      contextBranch: creationBase.kind === 'localBranch' ? creationBase.branch : '',
                      worktrees: repository.worktrees ?? [],
                    })
                    const dependencySource =
                      dependencySources.options.find(
                        (source) => source.id === repositoryBootstrapSources[repository.name]?.id,
                      ) ?? dependencySources.initial
                    const existingTarget = creationBase.kind === 'localBranch' && creationBase.branch === branch.trim()
                    const synchronizationEligible = syncEligible(repository, creationBase)
                    const remoteState = remoteBranches[repository.name]
                    return (
                      <div key={repository.name} className="grid gap-2">
                        <div
                          data-branch-workspace-repository-row={repository.name}
                          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.55fr)_minmax(8rem,0.8fr)_minmax(7rem,0.6fr)]"
                        >
                          <label
                            className={cn('flex items-center gap-2 text-xs', !repository.available && 'opacity-60')}
                          >
                            <input
                              type="checkbox"
                              aria-label={t('workspace.branch-workspace.repository-named', { name: repository.name })}
                              checked={selectedRepositories[repository.name] === true}
                              disabled={selectionLocked || fixed || !repository.available}
                              onChange={(event) => {
                                const selected = event.target.checked
                                setSelectedRepositories((current) => ({
                                  ...current,
                                  [repository.name]: selected,
                                }))
                                if (selected) void loadRemoteBranches(repository)
                                if (!selected) {
                                  setRepositoryDependenciesEnabled((current) => ({
                                    ...current,
                                    [repository.name]: false,
                                  }))
                                  clearRepositoryBootstrap(repository.name)
                                  remoteBranchControllers.current[repository.name]?.abort()
                                }
                              }}
                            />
                            <span className="truncate font-medium">{repository.name}</span>
                            {fixed ? (
                              <span className="text-[10px] text-muted-foreground">
                                {t('workspace.branch-workspace.member-fixed')}
                              </span>
                            ) : null}
                          </label>
                          <label className="flex min-w-0 items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={repositoryDependenciesEnabled[repository.name] === true}
                              disabled={
                                selectionLocked ||
                                fixed ||
                                !repository.available ||
                                !selectedRepositories[repository.name]
                              }
                              aria-label={t('workspace.branch-workspace.repository-dependencies-toggle-named', {
                                name: repository.name,
                              })}
                              title={t('workspace.branch-workspace.repository-dependencies-toggle-named', {
                                name: repository.name,
                              })}
                              onCheckedChange={(enabled) => {
                                setRepositoryDependenciesEnabled((current) => ({
                                  ...current,
                                  [repository.name]: enabled,
                                }))
                                if (enabled) initializeRepositoryBootstrap(repository)
                                else clearRepositoryBootstrap(repository.name)
                              }}
                            />
                            <span className="truncate">
                              {t('workspace.branch-workspace.repository-dependencies-toggle')}
                            </span>
                          </label>
                          <Select
                            value={creationBaseSelectValue(creationBase)}
                            disabled={
                              selectionLocked || fixed || !selectedRepositories[repository.name] || existingTarget
                            }
                            onValueChange={(value) => {
                              const nextCreationBase = parseCreationBaseSelectValue(value)
                              if (!nextCreationBase) return
                              setCreationBases((current) => ({
                                ...current,
                                [repository.name]: nextCreationBase,
                              }))
                              setSyncBeforeCreate((current) => ({
                                ...current,
                                [repository.name]: syncEligible(repository, nextCreationBase),
                              }))
                              if (repositoryDependenciesEnabled[repository.name]) {
                                initializeRepositoryBootstrap(repository, nextCreationBase)
                              }
                            }}
                            onOpenChange={(open) => {
                              if (!open) {
                                setRepositoryBranchQueries((current) => {
                                  const next = { ...current }
                                  delete next[repository.name]
                                  return next
                                })
                              }
                            }}
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label={t('workspace.branch-workspace.base-named', { name: repository.name })}
                              className="font-mono text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent
                              header={
                                !existingTarget ? (
                                  <RemoteBranchSearchInput
                                    id={`branch-workspace-base-search-${repository.name}`}
                                    value={repositoryBranchQueries[repository.name] ?? ''}
                                    placeholder={t('branches.search-placeholder')}
                                    ariaLabel={t('branches.search-label')}
                                    disabled={selectionLocked || fixed || !selectedRepositories[repository.name]}
                                    onChange={(query) => {
                                      setRepositoryBranchQueries((current) => ({
                                        ...current,
                                        [repository.name]: query,
                                      }))
                                    }}
                                  />
                                ) : undefined
                              }
                            >
                              {(existingTarget ? [branch.trim()] : repository.branches)
                                .filter((candidate) =>
                                  localBranchMatchesQuery(candidate, repositoryBranchQueries[repository.name] ?? ''),
                                )
                                .map((candidate) => (
                                  <SelectItem key={`local:${candidate}`} value={candidate} textValue={candidate}>
                                    {candidate}
                                  </SelectItem>
                                ))}
                              {!existingTarget &&
                                remoteState?.branches
                                  .filter((candidate) =>
                                    remoteRefMatchesQuery(candidate, repositoryBranchQueries[repository.name] ?? ''),
                                  )
                                  .map((candidate) => (
                                    <SelectItem
                                      key={`remote:${candidate}`}
                                      value={`remote:${candidate}`}
                                      textValue={candidate}
                                    >
                                      {candidate}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                          <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              aria-label={t('workspace.branch-workspace.sync-before-create-named', {
                                name: repository.name,
                              })}
                              checked={syncBeforeCreate[repository.name] === true && synchronizationEligible}
                              disabled={
                                selectionLocked ||
                                fixed ||
                                !selectedRepositories[repository.name] ||
                                !synchronizationEligible
                              }
                              onChange={(event) =>
                                setSyncBeforeCreate((current) => ({
                                  ...current,
                                  [repository.name]: event.target.checked,
                                }))
                              }
                            />
                            <span className="truncate">{t('workspace.branch-workspace.sync-before-create')}</span>
                          </label>
                        </div>
                        {selectedRepositories[repository.name] && existingTarget ? (
                          <p className="pl-6 text-[10px] text-muted-foreground">
                            {t('workspace.branch-workspace.existing-target-used', { branch: branch.trim() })}
                          </p>
                        ) : null}
                        {selectedRepositories[repository.name] &&
                        creationBase.kind === 'localBranch' &&
                        !synchronizationEligible ? (
                          <p className="pl-6 text-[10px] text-muted-foreground">
                            {t('workspace.branch-workspace.sync-no-upstream')}
                          </p>
                        ) : null}
                        {selectedRepositories[repository.name] && remoteState?.status === 'loading' ? (
                          <p className="pl-6 text-[10px] text-muted-foreground" role="status">
                            {t('workspace.branch-workspace.remote-branches-loading')}
                          </p>
                        ) : null}
                        {selectedRepositories[repository.name] && remoteState?.status === 'error' ? (
                          <div className="flex items-center gap-2 pl-6 text-[10px] text-danger" role="alert">
                            <span>{t('workspace.branch-workspace.remote-branches-error')}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void loadRemoteBranches(repository)}
                            >
                              {t('workspace.branch-workspace.retry')}
                            </Button>
                          </div>
                        ) : null}
                        {selectedRepositories[repository.name] &&
                        repositoryDependenciesEnabled[repository.name] &&
                        !fixed ? (
                          <div
                            className="grid gap-2 pl-6"
                            aria-labelledby={`branch-workspace-repository-dependencies-${repository.name}`}
                          >
                            <div>
                              <p
                                id={`branch-workspace-repository-dependencies-${repository.name}`}
                                className="text-xs font-medium"
                              >
                                {t('workspace.branch-workspace.repository-dependencies')}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {t('workspace.branch-workspace.repository-dependencies-description')}
                              </p>
                            </div>
                            {dependencySource ? (
                              <BranchWorkspaceRepositoryDependencySelection
                                repoId={repository.id}
                                source={dependencySource}
                                sourceOptions={dependencySources.options}
                                selections={repositoryBootstrapSelections[repository.name] ?? []}
                                disabled={selectionLocked}
                                onSourceChange={(source) => {
                                  setRepositoryDependencyReadPending((current) => ({
                                    ...current,
                                    [repository.name]: true,
                                  }))
                                  setRepositoryBootstrapSources((current) => ({
                                    ...current,
                                    [repository.name]: source,
                                  }))
                                  setRepositoryBootstrapSelections((current) => ({
                                    ...current,
                                    [repository.name]: [],
                                  }))
                                }}
                                onPendingChange={(nextPending) =>
                                  setRepositoryDependencyReadPending((current) =>
                                    current[repository.name] === nextPending
                                      ? current
                                      : { ...current, [repository.name]: nextPending },
                                  )
                                }
                                onSelectionsChange={(selections) =>
                                  setRepositoryBootstrapSelections((current) => ({
                                    ...current,
                                    [repository.name]: selections,
                                  }))
                                }
                              />
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t('workspace.branch-workspace.repository-dependencies-empty')}
                              </p>
                            )}
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
                    onChoiceChange={(name, choice) =>
                      setAuxiliaryChoices((current) => ({ ...current, [name]: choice }))
                    }
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
                        disabled={selectionLocked || auxiliaryRefreshPending}
                        onClick={() => void refreshAuxiliaryCandidates()}
                      >
                        <RefreshCw className={cn(auxiliaryRefreshPending && 'animate-spin')} aria-hidden="true" />
                      </Button>
                    }
                    disabled={selectionLocked}
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

            {oneStep && mode === 'reduce' && workspace ? (
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
                        disabled={selectionLocked || fixedReduceRepositoryName !== null}
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

            {oneStep && mode === 'remove' ? (
              <div
                data-branch-workspace-delete-scope
                className="overflow-hidden rounded-md border border-danger-border bg-card text-xs"
              >
                <div className="flex items-start gap-2 border-b border-danger-border/60 bg-danger-surface p-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  <p className="leading-relaxed">{t('workspace.branch-workspace.delete-warning')}</p>
                </div>
                <div className="grid divide-y divide-danger-border/50">
                  <label className="flex items-center gap-2 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={t('workspace.branch-workspace.delete-local-branch')}
                      checked={alsoDeleteBranch}
                      disabled={selectionLocked}
                      onChange={(event) => {
                        setAlsoDeleteBranch(event.target.checked)
                        if (!event.target.checked) setAlsoDeleteUpstream(false)
                      }}
                    />
                    {t('workspace.branch-workspace.delete-local-branch')}
                  </label>
                  <label
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5',
                      (selectionLocked || !alsoDeleteBranch) && 'opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={t('workspace.branch-workspace.delete-upstream-branch')}
                      checked={alsoDeleteUpstream}
                      disabled={selectionLocked || !alsoDeleteBranch}
                      onChange={(event) => setAlsoDeleteUpstream(event.target.checked)}
                    />
                    {t('workspace.branch-workspace.delete-upstream-branch')}
                  </label>
                </div>
              </div>
            ) : null}
          </OneStepPlanningSelectionPane>
          <OneStepPlanningPlanPane
            enabled={oneStep}
            testIdPrefix="branch-workspace"
            title={t('workspace.branch-workspace.one-step.plan-title')}
            description={operationConsole ? t(planDescriptionKey) : undefined}
            presentation={operationConsole ? 'operation-console' : 'plain'}
            tone={operationTone}
            step={operationConsole ? '02' : undefined}
          >
            {workspace ? (
              <WorkspaceSummary
                workspace={workspace}
                tone={operationConsole && mode === 'remove' ? 'destructive' : 'neutral'}
              />
            ) : null}
            {displayedPlan ? (
              <div className="grid gap-3">
                {operationProgress ? (
                  <div
                    data-branch-workspace-operation-progress
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-md border border-separator bg-muted/20 px-3 py-2 text-xs"
                  >
                    {operationPending ? (
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
                <div className="overflow-hidden rounded-md border border-separator bg-card">
                  {displayedPlan.steps.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      {t('workspace.branch-workspace.no-pending-steps')}
                    </p>
                  ) : (
                    groupBranchCleanupSteps(displayedPlan.steps).map((item, itemIndex) => {
                      if (item.kind === 'branch-group') {
                        return (
                          <div
                            key={item.steps.map((step) => step.id).join(':')}
                            data-branch-workspace-branch-group={item.repositoryName}
                            role="group"
                            aria-label={item.repositoryName}
                            className="flex items-start gap-2 border-b border-separator/60 bg-muted/10 px-3 py-2.5 text-xs last:border-b-0"
                          >
                            {operationConsole ? <BranchWorkspacePlanSequence index={itemIndex} /> : null}
                            <div
                              className={cn(
                                'grid min-w-0 flex-1 gap-2',
                                item.steps.length > 1 &&
                                  'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center',
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
                      const creationRepository =
                        step.kind === 'create-worktree' && step.repositoryName
                          ? displayedPlan.repositories.find(
                              (repository) => repository.repositoryName === step.repositoryName,
                            )
                          : undefined
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
                          {operationConsole ? <BranchWorkspacePlanSequence index={itemIndex} /> : null}
                          <div className="grid min-w-0 flex-1 gap-0.5">
                            <span>{step.label}</span>
                            {creationRepository ? (
                              <>
                                <BranchWorkspaceCreationSourcePreview repository={creationRepository} />
                                <BranchWorkspaceRepositoryDependencyPreview repository={creationRepository} />
                              </>
                            ) : null}
                          </div>
                          {progressStatusByStepId.get(step.id) ? (
                            <PlanStepProgressStatus status={progressStatusByStepId.get(step.id)!} />
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
                {displayedPlan.requiredApprovals.length > 0 ? (
                  <fieldset className="grid gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                    <legend className="px-1 text-xs font-medium">{t('workspace.branch-workspace.approvals')}</legend>
                    {displayedPlan.requiredApprovals.map((approval) => (
                      <label key={approval} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          aria-label={t(`workspace.branch-workspace.approval.${approval}`)}
                          checked={approvals.includes(approval)}
                          disabled={operationPending}
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
            ) : oneStep ? (
              operationConsole ? (
                <BranchWorkspacePlanPlaceholder status={autoPlan.status} tone={operationTone} />
              ) : (
                <div
                  data-plan-status={autoPlan.status}
                  className="flex min-h-20 items-center justify-center gap-2 rounded-md border border-separator bg-muted/20 p-4 text-xs text-muted-foreground"
                  role="status"
                >
                  {autoPlan.status === 'planning' ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t(
                    autoPlan.status === 'planning'
                      ? 'workspace.branch-workspace.one-step.planning'
                      : autoPlan.status === 'error'
                        ? 'workspace.branch-workspace.one-step.plan-error'
                        : 'workspace.branch-workspace.one-step.incomplete',
                  )}
                </div>
              )
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
          </OneStepPlanningPlanPane>
        </OneStepPlanningLayout>

        <DialogFooter
          className={cn(
            operationConsole &&
              '-mx-4 -mb-4 border-t bg-muted/10 px-4 py-3 [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto',
          )}
        >
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
          {!oneStep && !plan ? (
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
          {plan && mode === 'remove' ? (
            <Button
              type="button"
              data-action="force-confirm"
              variant={operationConsole ? 'destructive-soft' : 'destructive'}
              title={t('workspace.branch-workspace.force-delete-description')}
              disabled={operationPending || !currentPlanReady || !requiredApprovalsSatisfied}
              onClick={() => void run(onForceConfirm)}
            >
              {t('workspace.branch-workspace.force-delete')}
            </Button>
          ) : null}
          {plan || oneStep ? (
            <Button
              type="button"
              data-action="confirm"
              variant={destructiveConfirm ? 'destructive' : 'default'}
              disabled={operationPending || !currentPlanReady || !requiredApprovalsSatisfied}
              onClick={() => void run(onConfirm)}
            >
              {operationProgress && operationPending && result === null ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : operationConsole ? (
                mode === 'create' ? (
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )
              ) : null}
              {t(`workspace.branch-workspace.dialog.${mode}.confirm`)}
            </Button>
          ) : null}
          {result && !result.ok && (mode === 'create' || mode === 'extend') ? (
            <Button
              type="button"
              data-action="return-to-selection"
              variant="outline"
              disabled={operationPending}
              onClick={onReturnToSelection}
            >
              {t(
                oneStep
                  ? 'workspace.branch-workspace.one-step.modify-selection'
                  : 'workspace.branch-workspace.return-to-selection',
              )}
            </Button>
          ) : null}
          {result && !result.ok ? (
            <Button
              type="button"
              data-action="retry"
              variant="outline"
              disabled={operationPending || !requiredApprovalsSatisfied}
              onClick={() => void run(onRetry)}
            >
              {operationProgress && operationPending ? (
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

function defaultCreationBase(repository: BranchWorkspaceRepositoryOption): WorktreeCreationBase {
  return {
    kind: 'localBranch',
    branch: repository.defaultBranch || repository.branches[0] || '',
  }
}

function effectiveCreationBase(
  repository: BranchWorkspaceRepositoryOption,
  targetBranch: string,
  requested: WorktreeCreationBase,
): WorktreeCreationBase {
  return targetBranch && repository.branches.includes(targetBranch)
    ? { kind: 'localBranch', branch: targetBranch }
    : requested
}

function syncEligible(repository: BranchWorkspaceRepositoryOption, creationBase: WorktreeCreationBase): boolean {
  if (creationBase.kind === 'remoteBranch') return true
  const details = repository.branchDetails?.[creationBase.branch]
  return !!details?.tracking && !details.trackingGone && isRemoteTrackingRef(details.tracking)
}

function creationBaseSelectValue(creationBase: WorktreeCreationBase): string {
  return creationBase.kind === 'localBranch' ? creationBase.branch : `remote:${creationBase.remoteRef}`
}

function parseCreationBaseSelectValue(value: string): WorktreeCreationBase | null {
  if (!value) return null
  return value.startsWith('remote:')
    ? { kind: 'remoteBranch', remoteRef: value.slice('remote:'.length) }
    : { kind: 'localBranch', branch: value }
}

function sameCreationBase(left: WorktreeCreationBase, right: WorktreeCreationBase): boolean {
  return left.kind === right.kind && worktreeCreationBaseRef(left) === worktreeCreationBaseRef(right)
}

function BranchWorkspaceCreationSourcePreview({ repository }: { repository: BranchWorkspaceRepositoryPlan }) {
  const t = useT()
  const existingTarget = repository.mode.kind === 'existingBranch'
  const sourceKey = existingTarget
    ? 'workspace.branch-workspace.preview-source-existing-target'
    : repository.creationBase.kind === 'remoteBranch'
      ? 'workspace.branch-workspace.preview-source-remote'
      : 'workspace.branch-workspace.preview-source-local'
  const sourceRef = existingTarget
    ? repository.targetBranch
    : repository.creationBase.kind === 'remoteBranch'
      ? repository.creationBase.remoteRef
      : repository.creationBase.branch
  return (
    <span data-branch-workspace-creation-source className="font-normal text-[10px] text-muted-foreground">
      {t(sourceKey, { ref: sourceRef })} ·{' '}
      {t(
        repository.syncBeforeCreate
          ? 'workspace.branch-workspace.preview-sync-enabled'
          : 'workspace.branch-workspace.preview-sync-disabled',
      )}
    </span>
  )
}

function BranchWorkspaceRepositoryDependencyPreview({ repository }: { repository: BranchWorkspaceRepositoryPlan }) {
  const t = useT()
  if (repository.worktreeBootstrap.kind !== 'materialize') return null
  const { selections } = repository.worktreeBootstrap
  if (selections.length === 0) return null

  return (
    <div
      data-branch-workspace-plan-repository-dependencies={repository.repositoryName}
      role="group"
      aria-label={t('workspace.branch-workspace.repository-dependencies')}
      className="mt-1 grid gap-1.5 rounded-md border border-separator/60 bg-muted/15 p-2 font-normal"
    >
      <span className="text-[10px] font-medium text-muted-foreground">
        {t('workspace.branch-workspace.repository-dependencies')}
      </span>
      <ul className="grid gap-1">
        {selections.map((selection) => (
          <li
            key={selection.path}
            data-branch-workspace-plan-repository-dependency={selection.path}
            className="flex min-w-0 items-center gap-1.5 text-[10px]"
          >
            <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
            <code className="min-w-0 break-all font-mono" title={selection.path}>
              {selection.path}
            </code>
            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {t(`worktree-dependency-tree.${selection.mode}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BranchWorkspacePlanPlaceholder({
  status,
  tone,
}: {
  status: 'incomplete' | 'planning' | 'ready' | 'error'
  tone: 'constructive' | 'destructive'
}) {
  const t = useT()
  const icon =
    status === 'planning' ? (
      <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
    ) : status === 'error' ? (
      <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden="true" />
    ) : (
      <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
    )
  return (
    <div
      data-plan-status={status}
      data-operation-tone={tone}
      className={cn(
        'flex min-h-20 items-start gap-2 rounded-md border p-3 text-xs',
        status === 'error'
          ? 'border-danger-border bg-danger-surface text-danger'
          : 'border-separator bg-muted/20 text-muted-foreground',
      )}
      role="status"
    >
      {icon}
      <span className="leading-relaxed">
        {t(
          status === 'planning'
            ? 'workspace.branch-workspace.one-step.planning'
            : status === 'error'
              ? 'workspace.branch-workspace.one-step.plan-error'
              : 'workspace.branch-workspace.one-step.incomplete',
        )}
      </span>
    </div>
  )
}

function BranchWorkspacePlanSequence({ index }: { index: number }) {
  return (
    <span
      data-branch-workspace-plan-sequence={index + 1}
      aria-hidden="true"
      className="w-5 shrink-0 pt-0.5 font-mono text-[9px] font-medium tabular-nums text-muted-foreground"
    >
      {String(index + 1).padStart(2, '0')}
    </span>
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

function localBranchMatchesQuery(branch: string, query: string): boolean {
  return remoteRefMatchesQuery(branch, query)
}

function WorkspaceSummary({
  workspace,
  tone = 'neutral',
}: {
  workspace: BranchWorkspaceSnapshot
  tone?: 'neutral' | 'destructive'
}) {
  const t = useT()
  return (
    <div
      data-branch-workspace-target-summary
      className={cn(
        'grid gap-1 rounded-md border bg-muted/20 p-3 text-xs',
        tone === 'destructive' ? 'border-danger-border' : 'border-separator',
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <FolderKanban className="size-4" aria-hidden="true" />
        <span>{workspace.branch}</span>
      </div>
      <span className="break-all font-mono text-[10px] text-muted-foreground" title={workspace.path}>
        {workspace.path}
      </span>
      {workspace.issues.map((issue, index) => (
        <span key={`${issue.kind}-${index}`} className="text-warning">
          {t(issue.message ?? `workspace.branch-workspace.issue.${issue.kind}`)}
        </span>
      ))}
    </div>
  )
}
