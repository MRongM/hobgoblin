import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  ClipboardList,
  FolderKanban,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import type {
  BranchWorkspaceApproval,
  BranchWorkspaceMemberKind,
  BranchWorkspaceMemberSource,
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
import { isAbsoluteWorktreePath, isRemoteTrackingRef, type WorktreeCreationBase } from '#/shared/worktree-create.ts'
import { isSafeBranchWorkspaceFolderName, normalizeBranchWorkspacePlanRequest } from '#/shared/branch-workspaces.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'
import { joinWorktreeRelativePath } from '#/shared/path-semantics.ts'
import { chooseSubworkspaceParentPath, canChooseSubworkspaceParentPath } from '#/web/app-shell-client.ts'
import { BranchWorkspaceCreateFields } from '#/web/components/repo-workspace/BranchWorkspaceCreateFields.tsx'
import {
  BranchWorkspaceMemberConfiguration,
  type MemberCheckoutMode,
} from '#/web/components/repo-workspace/BranchWorkspaceMemberConfiguration.tsx'
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
  defaultParentDirectory?: string
  allowNativeDirectoryPicker?: boolean
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

function defaultFolderName(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `feature-${year}${month}${day}`
}

export function BranchWorkspaceDialog({
  open,
  mode,
  repositories: sourceRepositories,
  defaultParentDirectory = '',
  allowNativeDirectoryPicker = false,
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
  const [folderName, setFolderName] = useState('')
  const [parentDirectory, setParentDirectory] = useState('')
  const [directoryPickerPending, setDirectoryPickerPending] = useState(false)
  const [directoryPickerError, setDirectoryPickerError] = useState<string | null>(null)
  const [aliasSourceId, setAliasSourceId] = useState('')
  const parentDirectoryValid = parentDirectory.trim()
    ? isAbsoluteWorktreePath(parentDirectory.trim()) && !/[\x00-\x1f\x7f]/.test(parentDirectory)
    : !defaultParentDirectory && !workspace
  const nativeDirectoryPicker = allowNativeDirectoryPicker && canChooseSubworkspaceParentPath()

  const [extraRepositories, setExtraRepositories] = useState<BranchWorkspaceRepositoryOption[]>([])
  const [memberKinds, setMemberKinds] = useState<Record<string, BranchWorkspaceMemberKind>>({})
  const [memberSources, setMemberSources] = useState<Record<string, BranchWorkspaceMemberSource>>({})
  const [memberDirectories, setMemberDirectories] = useState<Record<string, string>>({})
  const [memberBranches, setMemberBranches] = useState<Record<string, string>>({})
  const [memberCheckoutModes, setMemberCheckoutModes] = useState<Record<string, MemberCheckoutMode>>({})
  const [memberRefs, setMemberRefs] = useState<Record<string, string>>({})
  const fixedOptions: BranchWorkspaceRepositoryOption[] = (workspace?.repositories ?? [])
    .filter(
      (member) =>
        member.progress !== 'removed' && !sourceRepositories.some((source) => source.name === member.repositoryName),
    )
    .map((member) => ({
      id: member.source?.kind === 'repository' ? member.source.repositoryId : (member.repositoryId ?? ''),
      name: member.repositoryName,
      available: true,
      branches: [member.targetBranch],
      defaultBranch: member.targetBranch,
    }))
  const repositories = [...sourceRepositories, ...fixedOptions, ...extraRepositories].map((row) => {
    const source = memberSources[row.name]
    const repository =
      source?.kind === 'repository' ? sourceRepositories.find((option) => option.id === source.repositoryId) : undefined
    return repository ? { ...repository, name: row.name } : row
  })
  const targetBranchFor = (repository: BranchWorkspaceRepositoryOption) => memberBranches[repository.name]?.trim() ?? ''
  const isCompleteMember = (repository: BranchWorkspaceRepositoryOption) =>
    (memberKinds[repository.name] ?? 'worktree') === 'repository'
  const isUrlMember = (repository: BranchWorkspaceRepositoryOption) => memberSources[repository.name]?.kind === 'url'

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
  const [planNotBefore, setPlanNotBefore] = useState(0)
  const dialogStateKey = open ? JSON.stringify([mode, workspace?.id ?? null, fixedReduceRepositoryName]) : null
  const [initializedDialogStateKey, setInitializedDialogStateKey] = useState<string | null>(null)
  const oneStep = mode === 'create' || mode === 'extend' || mode === 'reduce' || mode === 'remove'
  const creating = mode === 'create'
  const operationConsole = mode === 'remove'
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
  const initialDialogState = useRef({
    workspace,
    repositories,
    fixedRepositories,
    defaultParentDirectory,
    sourceRepositories,
  })
  initialDialogState.current = {
    workspace,
    repositories,
    fixedRepositories,
    defaultParentDirectory,
    sourceRepositories,
  }

  useEffect(() => {
    if (!open) {
      setInitializedDialogStateKey(null)
      return
    }
    const initial = initialDialogState.current
    const initialMembers = new Map(
      initial.workspace?.repositories.map((member) => [member.repositoryName, member]) ?? [],
    )
    const initialFolderName = initial.workspace?.directoryName ?? (mode === 'create' ? defaultFolderName() : '')
    const initialBases = Object.fromEntries(
      initial.repositories.map((repository) => [
        repository.name,
        initialMembers.get(repository.name)?.creationBase ?? defaultCreationBase(repository),
      ]),
    )
    setFolderName(initialFolderName)
    setParentDirectory(
      initial.workspace?.parentDirectory ??
        (initial.workspace ? parentPathForDisplay(initial.workspace.path) : initial.defaultParentDirectory),
    )
    setDirectoryPickerPending(false)
    setDirectoryPickerError(null)
    setAliasSourceId(initial.sourceRepositories.find((repository) => repository.available)?.id ?? '')
    setExtraRepositories([])
    setMemberCheckoutModes(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          initialMembers.get(repository.name)?.mode?.kind ?? 'auto',
        ]),
      ),
    )
    setMemberRefs(
      Object.fromEntries(
        initial.repositories.map((repository) => {
          const mode = initialMembers.get(repository.name)?.mode
          return [
            repository.name,
            mode?.kind === 'detached'
              ? mode.ref
              : mode?.kind === 'trackRemoteBranch'
                ? mode.remoteRef
                : mode?.kind === 'newBranch' && mode.creationBase.kind === 'localBranch'
                  ? mode.creationBase.branch
                  : '',
          ]
        }),
      ),
    )
    setMemberKinds(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          initialMembers.get(repository.name)?.kind ?? 'worktree',
        ]),
      ),
    )
    setMemberSources(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          initialMembers.get(repository.name)?.source ?? { kind: 'repository', repositoryId: repository.id },
        ]),
      ),
    )
    setMemberDirectories(
      Object.fromEntries(initial.repositories.map((repository) => [repository.name, repository.name])),
    )
    setMemberBranches(
      Object.fromEntries(
        initial.repositories.map((repository) => [
          repository.name,
          initialMembers.get(repository.name)?.targetBranch ?? defaultFolderName().replace('feature-', 'feat/'),
        ]),
      ),
    )
    setSelectedRepositories(
      Object.fromEntries(
        mode === 'reduce' &&
          initial.workspace?.state.kind === 'needs-action' &&
          initial.workspace.state.action === 'continue-reduce'
          ? initial.workspace.repositories.map((member) => [member.repositoryName, member.progress !== 'complete'])
          : initial.repositories.map((repository) => [
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
                effectiveCreationBase(
                  repository,
                  initialMembers.get(repository.name)?.targetBranch ?? defaultFolderName().replace('feature-', 'feat/'),
                  initialBases[repository.name]!,
                ),
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
    setAlsoDeleteBranch(
      mode === 'remove' &&
        !(initial.workspace?.state.kind === 'needs-action' && initial.workspace.state.action === 'continue-delete'),
    )
    setAlsoDeleteUpstream(false)
    setApprovals([])
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
    if (isUrlMember(repository)) return
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
    }
  }

  const applyFolderNameChange = (nextFolder: string) => {
    if (nextFolder.trim() !== folderName.trim()) setPlanNotBefore(Date.now() + 300)
    setFolderName(nextFolder)
  }

  const changeMemberBranch = (repository: BranchWorkspaceRepositoryOption, nextBranch: string) => {
    setMemberBranches((current) => ({ ...current, [repository.name]: nextBranch }))
    const nextBase = effectiveCreationBase(
      repository,
      nextBranch.trim(),
      creationBases[repository.name] ?? defaultCreationBase(repository),
    )
    setSyncBeforeCreate((current) => ({ ...current, [repository.name]: syncEligible(repository, nextBase) }))
    if (repositoryDependenciesEnabled[repository.name]) initializeRepositoryBootstrap(repository, nextBase)
  }

  const addMember = (source: BranchWorkspaceRepositoryOption | null) => {
    const names = new Set(repositories.map((repository) => repository.name))
    const stem = source?.name ?? 'repository'
    let name = `${stem}-2`
    for (let index = 3; names.has(name); index++) name = `${stem}-${index}`
    setExtraRepositories((current) => [
      ...current,
      { ...(source ?? { id: '', available: true, branches: [], defaultBranch: '' }), name },
    ])
    setSelectedRepositories((current) => ({ ...current, [name]: true }))
    setMemberDirectories((current) => ({ ...current, [name]: name }))
    setMemberKinds((current) => ({ ...current, [name]: source ? 'worktree' : 'repository' }))
    setMemberBranches((current) => ({
      ...current,
      [name]: source ? defaultFolderName().replace('feature-', 'feat/') : '',
    }))
    setMemberSources((current) => ({
      ...current,
      [name]: source ? { kind: 'repository', repositoryId: source.id } : { kind: 'url', url: '' },
    }))
    if (source) void loadRemoteBranches({ ...source, name })
  }

  const initializeRepositoryBootstrap = (
    repository: BranchWorkspaceRepositoryOption,
    creationBase = effectiveCreationBase(
      repository,
      targetBranchFor(repository),
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
    directoryName: folderName.trim(),
    ...(workspace
      ? workspace.parentDirectory
        ? { parentDirectory: workspace.parentDirectory }
        : {}
      : parentDirectory.trim()
        ? { parentDirectory: parentDirectory.trim() }
        : {}),
    branch: '',
    ...(workspace ? { branchWorkspaceId: workspace.id } : {}),
    repositories: repositories.flatMap((repository) =>
      selectedRepositories[repository.name] && !fixedRepositories.has(repository.name)
        ? [repositorySelection(repository)]
        : [],
    ),
    auxiliaryEntries: auxiliaryCandidates.flatMap((candidate) => {
      if (workspace && fixedAuxiliary.has(candidate.name)) return []
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
      (isUrlMember(repository) && memberCheckoutModes[repository.name] === 'newBranch'
        ? { kind: 'localBranch' as const, branch: memberRefs[repository.name]?.trim() ?? '' }
        : effectiveCreationBase(
            repository,
            targetBranchFor(repository),
            creationBases[repository.name] ?? defaultCreationBase(repository),
          ))
    const dependencySource =
      !isCompleteMember(repository) && repositoryDependenciesEnabled[repository.name]
        ? repositoryBootstrapSources[repository.name]
        : undefined
    const selections = repositoryDependenciesEnabled[repository.name]
      ? (repositoryBootstrapSelections[repository.name] ?? [])
      : []
    const checkoutMode = memberCheckoutModes[repository.name] ?? 'auto'
    const targetBranch = targetBranchFor(repository)
    const ref = memberRefs[repository.name]?.trim() ?? ''
    const mode =
      fixed?.mode ??
      (checkoutMode === 'detached'
        ? { kind: 'detached' as const, ref }
        : checkoutMode === 'trackRemoteBranch'
          ? { kind: 'trackRemoteBranch' as const, remoteRef: ref, localBranch: targetBranch }
          : checkoutMode === 'newBranch'
            ? { kind: 'newBranch' as const, newBranch: targetBranch, creationBase }
            : checkoutMode === 'existingBranch'
              ? { kind: 'existingBranch' as const, branch: targetBranch }
              : undefined)
    return {
      ...(fixed?.memberId ? { memberId: fixed.memberId } : {}),
      ...(mode ? { mode } : {}),
      repositoryName: memberDirectories[repository.name]?.trim() ?? repository.name,
      kind: fixed?.kind ?? memberKinds[repository.name] ?? 'worktree',
      source: fixed?.source ?? memberSources[repository.name] ?? { kind: 'repository', repositoryId: repository.id },
      ...(checkoutMode !== 'detached' && targetBranch ? { targetBranch } : {}),
      creationBase,
      syncBeforeCreate:
        fixed?.syncBeforeCreate ??
        (checkoutMode !== 'detached' &&
          checkoutMode !== 'trackRemoteBranch' &&
          !isCompleteMember(repository) &&
          syncBeforeCreate[repository.name] === true &&
          syncEligible(repository, creationBase)),
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
      if (!workspace && (!parentDirectoryValid || (!!defaultParentDirectory && !parentDirectory.trim()))) return null
      const value = createRequest()
      const hasNewRepository = value.repositories.some(
        (repository) => !fixedRepositories.has(repository.repositoryName),
      )
      const hasNewAuxiliaryEntry = value.auxiliaryEntries.some((entry) => !fixedAuxiliary.has(entry.name))
      const validMembers = value.repositories.every(
        (member) =>
          isSafeBranchWorkspaceFolderName(member.repositoryName) &&
          (member.mode?.kind === 'detached'
            ? !!member.mode.ref && !member.mode.ref.startsWith('-')
            : member.targetBranch
              ? isSafeBranchName(member.targetBranch)
              : member.kind === 'repository' && member.source?.kind === 'url') &&
          (member.mode?.kind !== 'trackRemoteBranch' || isRemoteTrackingRef(member.mode.remoteRef)) &&
          (member.source?.kind !== 'url' || member.source.url.trim().length > 0),
      )
      if (!normalizeBranchWorkspacePlanRequest(value).ok) return null
      const uniqueDirectories =
        new Set(value.repositories.map((member) => member.repositoryName)).size === value.repositories.length
      return isSafeBranchWorkspaceFolderName(value.directoryName ?? '') &&
        validMembers &&
        uniqueDirectories &&
        (!workspace || hasNewRepository || hasNewAuxiliaryEntry)
        ? value
        : null
    }
    if (!workspace) return null
    if (mode === 'repair') return { operation: 'repair', branchWorkspaceId: workspace.id }
    if (mode === 'reduce') {
      const selected = workspace.repositories.flatMap((member) =>
        selectedRepositories[member.repositoryName] ? [member.repositoryName] : [],
      )
      return selected.length > 0
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
    debounceMs: 200,
    notBefore: planNotBefore,
    requestPlan: async (nextRequest, signal) =>
      plan && result === null && plannedRequestKey === JSON.stringify(nextRequest)
        ? true
        : (await onPreview(nextRequest, signal)) !== false,
  })
  const currentPlanReady =
    plan !== null &&
    (!oneStep || result === null) &&
    (!oneStep ||
      plannedRequest === undefined ||
      (autoPlan.status === 'ready' && currentRequestKey !== null && plannedRequestKey === currentRequestKey))
  const displayedPlan =
    plan &&
    (!oneStep ||
      plannedRequest === undefined ||
      executing ||
      result !== null ||
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
  const canConfirm =
    !(oneStep ? executing : pending) && !directoryPickerPending && currentPlanReady && requiredApprovalsSatisfied
  const targetPath =
    workspace?.path ??
    displayedPlan?.path ??
    (parentDirectoryValid && parentDirectory.trim() && isSafeBranchWorkspaceFolderName(folderName.trim())
      ? joinWorktreeRelativePath(parentDirectory.trim(), folderName.trim())
      : null)
  const selectedRepositoryCount = repositories.filter((repository) => selectedRepositories[repository.name]).length
  const selectedFileCount = Object.values(auxiliaryChoices).filter((choice) => choice !== 'skip').length
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
    if (
      isCompleteMember(repository) ||
      !repository.available ||
      fixedRepositories.has(repository.name) ||
      !selectedRepositories[repository.name]
    ) {
      return false
    }
    const creationBase = effectiveCreationBase(
      repository,
      targetBranchFor(repository),
      creationBases[repository.name] ?? defaultCreationBase(repository),
    )
    return (
      memberCheckoutModes[repository.name] !== 'detached' &&
      memberCheckoutModes[repository.name] !== 'trackRemoteBranch' &&
      syncEligible(repository, creationBase)
    )
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
          className={cn(
            'pr-8',
            operationConsole && '-mx-4 -mt-4 rounded-t-lg border-b border-separator px-4 py-3.5 pr-12',
          )}
        >
          <div className="flex items-start gap-3">
            {operationConsole ? (
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-separator bg-card/80 text-muted-foreground shadow-xs"
                aria-hidden="true"
              >
                <Trash2 className="size-4" />
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
          </div>
        </DialogHeader>

        <div className="contents">
          <OneStepPlanningLayout
            enabled={oneStep}
            testIdPrefix="branch-workspace"
            presentation={operationConsole ? 'operation-console' : 'plain'}
          >
            <OneStepPlanningSelectionPane
              enabled={oneStep}
              testIdPrefix="branch-workspace"
              title={t('workspace.branch-workspace.one-step.selection-title')}
              description={operationConsole ? t(selectionDescriptionKey) : undefined}
              presentation={operationConsole ? 'operation-console' : 'plain'}
              step={operationConsole ? '01' : undefined}
            >
              {oneStep && (mode === 'create' || mode === 'extend') ? (
                <div className="grid gap-4">
                  {creating ? (
                    <BranchWorkspaceCreateFields
                      folderName={folderName}
                      parentDirectory={parentDirectory}
                      parentDirectoryValid={parentDirectoryValid}
                      locked={selectionLocked}
                      fixed={!!workspace}
                      nativeDirectoryPicker={nativeDirectoryPicker}
                      directoryPickerPending={directoryPickerPending}
                      directoryPickerError={directoryPickerError}
                      onFolderNameChange={applyFolderNameChange}
                      onParentDirectoryChange={(value) => {
                        setParentDirectory(value)
                        setDirectoryPickerError(null)
                      }}
                      onBrowse={() => {
                        setDirectoryPickerPending(true)
                        setDirectoryPickerError(null)
                        void chooseSubworkspaceParentPath(
                          t('workspace.branch-workspace.storage-directory-picker-title'),
                        )
                          .then((path) => {
                            if (path) setParentDirectory(path)
                          })
                          .catch(() => setDirectoryPickerError('workspace.branch-workspace.directory-unavailable'))
                          .finally(() => setDirectoryPickerPending(false))
                      }}
                      onSubmit={() => {
                        if (canConfirm) void run(onConfirm)
                      }}
                    />
                  ) : (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        {t('workspace.branch-workspace.storage-directory')}
                        <div className="flex gap-2">
                          <Input
                            aria-label={t('workspace.branch-workspace.storage-directory')}
                            aria-invalid={!parentDirectoryValid}
                            value={parentDirectory}
                            disabled={selectionLocked || directoryPickerPending || !!workspace}
                            className="min-w-0 flex-1 font-mono"
                            onChange={(event) => {
                              setParentDirectory(event.target.value)
                              setDirectoryPickerError(null)
                            }}
                          />
                          {nativeDirectoryPicker && !workspace ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={t('workspace.branch-workspace.storage-directory-browse')}
                              disabled={selectionLocked || directoryPickerPending}
                              onClick={() => {
                                setDirectoryPickerPending(true)
                                setDirectoryPickerError(null)
                                void chooseSubworkspaceParentPath(
                                  t('workspace.branch-workspace.storage-directory-picker-title'),
                                )
                                  .then((path) => {
                                    if (path) setParentDirectory(path)
                                  })
                                  .catch(() =>
                                    setDirectoryPickerError('workspace.branch-workspace.directory-unavailable'),
                                  )
                                  .finally(() => setDirectoryPickerPending(false))
                              }}
                            >
                              <FolderOpen aria-hidden="true" />
                              {t('workspace.branch-workspace.storage-directory-browse')}
                            </Button>
                          ) : null}
                        </div>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {t(
                            workspace
                              ? 'workspace.branch-workspace.directory-fixed'
                              : 'workspace.branch-workspace.storage-directory-help',
                          )}
                        </span>
                        {!parentDirectoryValid || directoryPickerError ? (
                          <span className="text-[10px] font-normal text-danger" role="alert">
                            {t(directoryPickerError ?? 'workspace.branch-workspace.storage-directory-invalid')}
                          </span>
                        ) : null}
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        {t('workspace.branch-workspace.folder')}
                        <div className="flex gap-2">
                          <Input
                            aria-label={t('workspace.branch-workspace.folder')}
                            value={folderName}
                            disabled={selectionLocked || !!workspace}
                            className="font-mono flex-1 min-w-0"
                            onChange={(event) => applyFolderNameChange(event.target.value)}
                          />
                        </div>
                      </label>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t('workspace.branch-workspace.folder-registration-help')}
                      </p>
                    </>
                  )}
                  <details
                    key={`${mode}-repository-helpers`}
                    open={mode === 'extend'}
                    className="rounded-md border border-separator p-3"
                  >
                    <summary className="cursor-pointer text-xs font-medium">
                      {t('workspace.branch-workspace.member-helpers')}
                      {selectedRepositoryCount > 0 ? (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {t('workspace.branch-workspace.create.selected-count', { count: selectedRepositoryCount })}
                        </span>
                      ) : null}
                    </summary>
                    <fieldset
                      aria-label={t('workspace.branch-workspace.member-helpers')}
                      className="mt-3 grid min-w-0 gap-3"
                    >
                      {mode === 'create' && sourceRepositories.length > 0 ? (
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
                              const selectableNames = new Set(
                                selectableRepositories.map((repository) => repository.name),
                              )
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
                                  synchronizableSelectedRepositories.map((repository) => [
                                    repository.name,
                                    synchronized,
                                  ]),
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
                        const creationBase = effectiveCreationBase(
                          repository,
                          targetBranchFor(repository),
                          requestedCreationBase,
                        )
                        const dependencySources = repositoryDependencySources({
                          contextBranch: creationBase.kind === 'localBranch' ? creationBase.branch : '',
                          worktrees: repository.worktrees ?? [],
                        })
                        const dependencySource =
                          dependencySources.options.find(
                            (source) => source.id === repositoryBootstrapSources[repository.name]?.id,
                          ) ?? dependencySources.initial
                        const existingTarget =
                          !!targetBranchFor(repository) &&
                          creationBase.kind === 'localBranch' &&
                          creationBase.branch === targetBranchFor(repository) &&
                          (memberCheckoutModes[repository.name] ?? 'auto') === 'auto'
                        const synchronizationEligible =
                          !isCompleteMember(repository) &&
                          memberCheckoutModes[repository.name] !== 'detached' &&
                          memberCheckoutModes[repository.name] !== 'trackRemoteBranch' &&
                          syncEligible(repository, creationBase)
                        const remoteState = remoteBranches[repository.name]
                        return (
                          <div key={repository.name} className="grid gap-2">
                            <div
                              data-branch-workspace-repository-row={repository.name}
                              className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.55fr)_minmax(8rem,0.8fr)_minmax(7rem,0.6fr)]"
                            >
                              <label
                                className={cn(
                                  'flex items-center gap-2 text-xs sm:col-span-4',
                                  !repository.available && 'opacity-60',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={t('workspace.branch-workspace.repository-named', {
                                    name: repository.name,
                                  })}
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
                              {!creating || selectedRepositories[repository.name] ? (
                                <>
                                  <BranchWorkspaceMemberConfiguration
                                    name={repository.name}
                                    sources={sourceRepositories}
                                    branches={repository.branches}
                                    kind={memberKinds[repository.name] ?? 'worktree'}
                                    source={
                                      memberSources[repository.name] ?? {
                                        kind: 'repository',
                                        repositoryId: repository.id,
                                      }
                                    }
                                    directory={memberDirectories[repository.name] ?? repository.name}
                                    targetBranch={memberBranches[repository.name] ?? ''}
                                    checkoutMode={memberCheckoutModes[repository.name] ?? 'auto'}
                                    refValue={memberRefs[repository.name] ?? ''}
                                    disabled={selectionLocked || fixed}
                                    onKindChange={(kind) => {
                                      setMemberKinds((current) => ({ ...current, [repository.name]: kind }))
                                      if (kind === 'repository') {
                                        setRepositoryDependenciesEnabled((current) => ({
                                          ...current,
                                          [repository.name]: false,
                                        }))
                                        clearRepositoryBootstrap(repository.name)
                                        setSyncBeforeCreate((current) => ({ ...current, [repository.name]: false }))
                                      }
                                    }}
                                    onSourceChange={(sourceId) => {
                                      const source = sourceRepositories.find((option) => option.id === sourceId)
                                      if (!source) return
                                      setMemberSources((current) => ({
                                        ...current,
                                        [repository.name]: { kind: 'repository', repositoryId: source.id },
                                      }))
                                      setCreationBases((current) => ({
                                        ...current,
                                        [repository.name]: defaultCreationBase(source),
                                      }))
                                      setSyncBeforeCreate((current) => ({
                                        ...current,
                                        [repository.name]: syncEligible(source, defaultCreationBase(source)),
                                      }))
                                      setRepositoryDependenciesEnabled((current) => ({
                                        ...current,
                                        [repository.name]: false,
                                      }))
                                      clearRepositoryBootstrap(repository.name)
                                      void loadRemoteBranches({ ...source, name: repository.name })
                                    }}
                                    onUrlChange={(url) =>
                                      setMemberSources((current) => ({
                                        ...current,
                                        [repository.name]: { kind: 'url', url },
                                      }))
                                    }
                                    onDirectoryChange={(directory) =>
                                      setMemberDirectories((current) => ({ ...current, [repository.name]: directory }))
                                    }
                                    onBranchChange={(value) => changeMemberBranch(repository, value)}
                                    onCheckoutModeChange={(value) =>
                                      setMemberCheckoutModes((current) => ({ ...current, [repository.name]: value }))
                                    }
                                    onRefChange={(value) =>
                                      setMemberRefs((current) => ({ ...current, [repository.name]: value }))
                                    }
                                    onAddAlias={
                                      fixed || isUrlMember(repository) ? undefined : () => addMember(repository)
                                    }
                                  />
                                  {!isCompleteMember(repository) ? (
                                    <label className="flex min-w-0 items-center justify-center gap-2 text-xs text-muted-foreground">
                                      <Switch
                                        checked={repositoryDependenciesEnabled[repository.name] === true}
                                        disabled={
                                          selectionLocked ||
                                          fixed ||
                                          !repository.available ||
                                          !selectedRepositories[repository.name] ||
                                          isUrlMember(repository)
                                        }
                                        aria-label={t(
                                          'workspace.branch-workspace.repository-dependencies-toggle-named',
                                          {
                                            name: repository.name,
                                          },
                                        )}
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
                                  ) : null}
                                  {!isUrlMember(repository) ? (
                                    <Select
                                      value={creationBaseSelectValue(creationBase)}
                                      disabled={
                                        selectionLocked ||
                                        fixed ||
                                        !selectedRepositories[repository.name] ||
                                        existingTarget ||
                                        isUrlMember(repository)
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
                                        aria-label={t('workspace.branch-workspace.base-named', {
                                          name: repository.name,
                                        })}
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
                                              disabled={
                                                selectionLocked || fixed || !selectedRepositories[repository.name]
                                              }
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
                                        {(existingTarget ? [targetBranchFor(repository)] : repository.branches)
                                          .filter((candidate) =>
                                            localBranchMatchesQuery(
                                              candidate,
                                              repositoryBranchQueries[repository.name] ?? '',
                                            ),
                                          )
                                          .map((candidate) => (
                                            <SelectItem
                                              key={`local:${candidate}`}
                                              value={candidate}
                                              textValue={candidate}
                                            >
                                              {candidate}
                                            </SelectItem>
                                          ))}
                                        {!existingTarget &&
                                          remoteState?.branches
                                            .filter((candidate) =>
                                              remoteRefMatchesQuery(
                                                candidate,
                                                repositoryBranchQueries[repository.name] ?? '',
                                              ),
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
                                  ) : null}
                                  {!isCompleteMember(repository) ? (
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
                                      <span className="truncate">
                                        {t('workspace.branch-workspace.sync-before-create')}
                                      </span>
                                    </label>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                            {selectedRepositories[repository.name] && existingTarget ? (
                              <p className="pl-6 text-[10px] text-muted-foreground">
                                {t('workspace.branch-workspace.existing-target-used', {
                                  branch: targetBranchFor(repository),
                                })}
                              </p>
                            ) : null}
                            {selectedRepositories[repository.name] &&
                            !isCompleteMember(repository) &&
                            memberCheckoutModes[repository.name] !== 'detached' &&
                            memberCheckoutModes[repository.name] !== 'trackRemoteBranch' &&
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
                      {sourceRepositories.length > 0 ? (
                        <div className="flex min-w-0 items-end gap-2 border-t border-separator pt-2">
                          <label className="grid min-w-0 flex-1 gap-1 text-xs">
                            {t('workspace.branch-workspace.member-add-source')}
                            <select
                              data-member-add-source
                              aria-label={t('workspace.branch-workspace.member-add-source')}
                              className="h-8 min-w-0 rounded-md border border-input bg-background px-2"
                              value={aliasSourceId}
                              disabled={selectionLocked}
                              onChange={(event) => setAliasSourceId(event.target.value)}
                            >
                              <option value="" disabled>
                                {t('workspace.branch-workspace.member-add-source')}
                              </option>
                              {sourceRepositories.map((source) => (
                                <option key={source.id} value={source.id} disabled={!source.available}>
                                  {source.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-action="add-source-member"
                            disabled={
                              selectionLocked ||
                              !sourceRepositories.some((source) => source.id === aliasSourceId && source.available)
                            }
                            onClick={() => {
                              const source = sourceRepositories.find(
                                (repository) => repository.id === aliasSourceId && repository.available,
                              )
                              if (source) addMember(source)
                            }}
                          >
                            {t('workspace.branch-workspace.member-add-existing')}
                          </Button>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-action="add-url-member"
                        disabled={selectionLocked}
                        onClick={() => addMember(null)}
                      >
                        {t('workspace.branch-workspace.member-add-url')}
                      </Button>
                    </fieldset>
                  </details>
                  {creating ? (
                    <details className="rounded-md border border-separator p-3">
                      <summary className="cursor-pointer text-xs font-medium">
                        {t('workspace.branch-workspace.create.files-options')}
                        {selectedFileCount > 0 ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {t('workspace.branch-workspace.create.selected-count', { count: selectedFileCount })}
                          </span>
                        ) : null}
                      </summary>
                      <div className="mt-3 grid gap-2">
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
                        {auxiliaryRefreshError ? (
                          <p className="text-xs text-danger" role="alert">
                            {t(auxiliaryRefreshError)}
                          </p>
                        ) : null}
                      </div>
                    </details>
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
              title={t(
                creating
                  ? 'workspace.branch-workspace.create.plan-details'
                  : 'workspace.branch-workspace.one-step.plan-title',
              )}
              description={operationConsole ? t(planDescriptionKey) : undefined}
              presentation={operationConsole ? 'operation-console' : 'plain'}
              step={operationConsole ? '02' : undefined}
            >
              {workspace ? <WorkspaceSummary workspace={workspace} /> : null}
              {(creating ? targetPath : displayedPlan?.path) ? (
                <div
                  data-branch-workspace-planned-path
                  className="grid gap-1 rounded-md border border-separator bg-muted/20 p-3 text-xs"
                >
                  <span className="font-medium">{t('workspace.branch-workspace.target-directory')}</span>
                  <code
                    className="break-all text-[10px] text-muted-foreground"
                    title={(creating ? targetPath : displayedPlan?.path) ?? undefined}
                  >
                    {creating ? targetPath : displayedPlan?.path}
                  </code>
                </div>
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
                          (step.kind === 'create-worktree' || step.kind === 'clone-repository') && step.repositoryName
                            ? displayedPlan.repositories.find(
                                (repository) => repository.repositoryName === step.repositoryName,
                              )
                            : undefined
                        const removalRepository =
                          step.kind === 'remove-entry' && step.repositoryName
                            ? displayedPlan.repositories.find(
                                (repository) =>
                                  repository.repositoryName === step.repositoryName && repository.kind === 'repository',
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
                              <span>
                                {step.kind === 'clone-repository'
                                  ? `${t('workspace.branch-workspace.step.clone-repository')}: `
                                  : removalRepository
                                    ? `${t('workspace.branch-workspace.step.remove-repository')}: `
                                    : ''}
                                {step.label}
                              </span>
                              {removalRepository ? (
                                <div data-independent-repository-removal className="grid gap-1 text-[10px] text-danger">
                                  <code className="break-all">{removalRepository.worktreePath}</code>
                                  <span>
                                    {t('workspace.branch-workspace.repository-removal-preview', {
                                      dirty: t(removalRepository.dirty ? 'branches.dirty' : 'status.worktree-clean'),
                                      commits: removalRepository.localOnlyCommits ?? 0,
                                    })}
                                  </span>
                                </div>
                              ) : null}
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
              ) : creating ? (
                <div
                  data-plan-status={autoPlan.status}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  role="status"
                >
                  {autoPlan.status === 'planning' ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t(
                    autoPlan.status === 'planning'
                      ? 'workspace.branch-workspace.create.checking'
                      : autoPlan.status === 'error'
                        ? 'workspace.branch-workspace.one-step.plan-error'
                        : 'workspace.branch-workspace.one-step.incomplete',
                  )}
                </div>
              ) : oneStep ? (
                operationConsole ? (
                  <BranchWorkspacePlanPlaceholder status={autoPlan.status} />
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
        </div>

        <DialogFooter
          className={cn(
            operationConsole &&
              '-mx-4 -mb-4 border-t border-separator px-4 py-3 [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto',
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
              variant="destructive"
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
              disabled={!canConfirm}
              onClick={() => void run(onConfirm)}
            >
              {operationPending && result === null ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : operationConsole ? (
                <Trash2 className="size-3.5" aria-hidden="true" />
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
    branch: repository.defaultBranch || repository.branches[0] || 'main',
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
      {repository.source?.kind === 'url' ? repository.source.url : t(sourceKey, { ref: sourceRef })} ·{' '}
      {repository.mode.kind === 'detached'
        ? repository.mode.ref
        : repository.targetBranch || t('workspace.branch-workspace.member-default-branch')}{' '}
      ·{' '}
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

function BranchWorkspacePlanPlaceholder({ status }: { status: 'incomplete' | 'planning' | 'ready' | 'error' }) {
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

function WorkspaceSummary({ workspace }: { workspace: BranchWorkspaceSnapshot }) {
  return (
    <div
      data-branch-workspace-target-summary
      className="grid gap-1 rounded-md border border-separator bg-muted/20 p-3 text-xs"
    >
      <div className="flex items-center gap-2 font-medium">
        <FolderKanban className="size-4" aria-hidden="true" />
        <span>{workspace.directoryName}</span>
      </div>
      <span className="break-all font-mono text-[10px] text-muted-foreground" title={workspace.path}>
        {workspace.path}
      </span>
    </div>
  )
}

function parentPathForDisplay(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator < 0) return ''
  if (separator === 0 || (separator === 2 && /^[A-Za-z]:/.test(path))) return path.slice(0, separator + 1)
  return path.slice(0, separator)
}
