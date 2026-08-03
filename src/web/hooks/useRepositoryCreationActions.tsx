import { FolderPlus, RadioTower } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WorktreeBootstrapDecision, WorktreeBootstrapPreflight } from '#/shared/worktree-bootstrap-summary.ts'
import { CreateWorktreeDialog, type CreateWorktreeRequest } from '#/web/components/CreateWorktreeDialog.tsx'
import { PullRemoteBranchDialog } from '#/web/components/branch-list/BranchWriteDialogs.tsx'
import {
  repositoryDependencySources,
  type RepositoryDependencySource,
} from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import {
  branchActionDisplayPhase,
  type BranchActionItemId,
  type BranchActionRepo,
} from '#/web/hooks/branch-action-state.ts'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { getRepositoryWorktreeBootstrapPreflight } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

type RepositoryCreationActionId = Extract<BranchActionItemId, 'pullRemoteBranch' | 'createWorktree'>

export interface RepositoryCreationAction {
  id: RepositoryCreationActionId
  label: string
  title?: string
  disabled: boolean
  busy?: boolean
  visible: boolean
  icon: ReactNode
  onSelect: () => void | Promise<void>
}

interface RepositoryCreationActionOptions {
  forceDisabled?: boolean
}

interface CreateWorktreeActionOptions extends RepositoryCreationActionOptions {
  defaultBranch?: string
  busyTargetBranch?: string
}

interface RepositoryCreationActionResult {
  item: RepositoryCreationAction
  dialog: ReactNode
}

const EMPTY_BRANCHES: RepoBranchState[] = []

export function useTrackRemoteBranchAction(
  repo: BranchActionRepo | undefined,
  options: RepositoryCreationActionOptions = {},
): RepositoryCreationActionResult {
  const t = useT()
  const runBranchAction = useReposStore((state) => state.runBranchAction)
  const allBranches = useReposStore(
    (state) => (repo ? state.repos[repo.id]?.data.branches : undefined) ?? EMPTY_BRANCHES,
  )
  const dialog = useRetainedDialogState<string>()
  const branchActionBusy = !repo || repo.operations.branchAction.phase !== 'idle'
  const disabled = options.forceDisabled === true || branchActionBusy || repo?.remote.hasRemotes === false

  async function handleTrackRemoteBranch(input: { localBranch: string; remoteRef: string }) {
    if (!repo) return
    const result = await runBranchAction(
      repo.id,
      {
        kind: 'trackRemoteBranch',
        localBranch: input.localBranch,
        remoteRef: input.remoteRef,
      },
      { token: repo.instanceToken },
    )
    if (result && !result.ok) throw new Error(result.message)
    dialog.close()
  }

  return {
    item: {
      id: 'pullRemoteBranch',
      label: t('action.pull-remote-branch'),
      title: t('action.pull-remote-branch-title'),
      disabled,
      visible: true,
      icon: <RadioTower aria-hidden="true" />,
      onSelect: () => dialog.openWith(''),
    },
    dialog: repo ? (
      <PullRemoteBranchDialog
        open={dialog.open}
        repoId={repo.id}
        allBranches={allBranches}
        busy={repo.operations.branchAction.phase !== 'idle'}
        onClose={dialog.close}
        onTrack={handleTrackRemoteBranch}
      />
    ) : null,
  }
}

export function useCreateWorktreeAction(
  repo: BranchActionRepo | undefined,
  options: CreateWorktreeActionOptions = {},
): RepositoryCreationActionResult {
  const t = useT()
  const submitBranchAction = useReposStore((state) => state.submitBranchAction)
  const dialog = useRetainedDialogState<string>()
  const branchAction = repo?.operations.branchAction
  const phase =
    repo && branchAction?.reason === 'branch:createWorktree'
      ? options.busyTargetBranch
        ? branchActionDisplayPhase(repo, options.busyTargetBranch)
        : branchAction.phase === 'idle'
          ? null
          : branchAction.phase
      : null
  const busy = phase !== null
  const disabled = options.forceDisabled === true || !repo || branchAction?.phase !== 'idle'
  const label = !phase
    ? t('action.create-worktree')
    : phase === 'queued'
      ? t('action.create-worktree-queued-title')
      : t('action.create-worktree-creating-title')

  function handleCreateWorktree(request: CreateWorktreeRequest, worktreeBootstrap: WorktreeBootstrapDecision): void {
    if (!repo || disabled) return
    submitBranchAction(
      repo.id,
      {
        kind: 'createWorktree',
        input: request.input,
        worktreeBootstrap,
      },
      { token: repo.instanceToken, refreshOnError: false },
    )
  }

  return {
    item: {
      id: 'createWorktree',
      label,
      title: t('action.create-worktree-title'),
      disabled,
      busy,
      visible: true,
      icon: <FolderPlus aria-hidden="true" />,
      onSelect: () => dialog.openWith(''),
    },
    dialog: repo ? (
      <CreateWorktreeDialogConnected
        repoId={repo.id}
        defaultBranch={options.defaultBranch}
        open={dialog.open}
        onClose={dialog.close}
        onCreate={handleCreateWorktree}
      />
    ) : null,
  }
}

export function useRepositoryCreationActions(
  repo: BranchActionRepo | undefined,
  options: RepositoryCreationActionOptions = {},
): { items: RepositoryCreationAction[]; dialogs: ReactNode } {
  const trackRemoteBranch = useTrackRemoteBranchAction(repo, options)
  const createWorktree = useCreateWorktreeAction(repo, options)

  return {
    items: [trackRemoteBranch.item, createWorktree.item],
    dialogs: (
      <Fragment>
        {trackRemoteBranch.dialog}
        {createWorktree.dialog}
      </Fragment>
    ),
  }
}

function CreateWorktreeDialogConnected({
  repoId,
  defaultBranch,
  open,
  onClose,
  onCreate,
}: {
  repoId: string
  defaultBranch?: string
  open: boolean
  onClose: () => void
  onCreate: (request: CreateWorktreeRequest, worktreeBootstrap: WorktreeBootstrapDecision) => void | Promise<void>
}) {
  const repo = useReposStore((state) => state.repos[repoId])
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false)
  const [bootstrapPreflight, setBootstrapPreflight] = useState<WorktreeBootstrapPreflight | null>(null)
  const [bootstrapPreflightError, setBootstrapPreflightError] = useState(false)
  const [bootstrapPreflightLoading, setBootstrapPreflightLoading] = useState(false)
  const [sourceContextBranch, setSourceContextBranch] = useState<string>()
  const [requestedSource, setRequestedSource] = useState<RepositoryDependencySource>()
  const [activeSource, setActiveSource] = useState<RepositoryDependencySource>()
  const defaultSourceContextBranch = defaultBranch ?? repo?.data.currentBranch ?? ''
  const effectiveSourceContextBranch = sourceContextBranch ?? defaultSourceContextBranch
  const primaryWorktreePath = useMemo(
    () => Object.values(repo?.data.worktreesByPath ?? {}).find((worktree) => worktree.isMain)?.path,
    [repo?.data.worktreesByPath],
  )
  const sourceWorktreeByBranch = useMemo(
    () =>
      Object.fromEntries(
        (repo?.data.branches ?? []).flatMap((branch) =>
          branch.worktree?.path ? [[branch.name, branch.worktree.path] as const] : [],
        ),
      ),
    [repo?.data.branches],
  )
  const sources = useMemo(
    () =>
      repositoryDependencySources({
        baseBranch: effectiveSourceContextBranch,
        primaryWorktreePath,
        sourceWorktreeByBranch,
      }),
    [effectiveSourceContextBranch, primaryWorktreePath, sourceWorktreeByBranch],
  )
  const sourceOptions = useMemo(() => {
    const baseWorktreePath = sourceWorktreeByBranch[effectiveSourceContextBranch]
    const primaryMayBeSelected = !baseWorktreePath || !primaryWorktreePath || baseWorktreePath !== primaryWorktreePath
    return uniqueRepositoryDependencySources([
      ...(primaryMayBeSelected ? [sources.primary] : []),
      ...sources.alternatives.filter((candidate) => candidate.kind === 'branch'),
    ])
  }, [effectiveSourceContextBranch, primaryWorktreePath, sourceWorktreeByBranch, sources])
  const handleBootstrapContextBranchChange = useCallback(
    (branch: string) => {
      if (branch === effectiveSourceContextBranch) return
      setSourceContextBranch(branch)
      setRequestedSource(undefined)
    },
    [effectiveSourceContextBranch],
  )

  useEffect(() => {
    if (!open) {
      setBootstrapEnabled(false)
      setBootstrapPreflight(null)
      setBootstrapPreflightError(false)
      setBootstrapPreflightLoading(false)
      setSourceContextBranch(undefined)
      setRequestedSource(undefined)
      setActiveSource(undefined)
      return
    }
    if (!bootstrapEnabled) {
      setBootstrapPreflight(null)
      setBootstrapPreflightError(false)
      setBootstrapPreflightLoading(false)
      setRequestedSource(undefined)
      setActiveSource(undefined)
      return
    }
    const controller = new AbortController()
    setBootstrapPreflight(null)
    setBootstrapPreflightError(false)
    setBootstrapPreflightLoading(true)
    void (async () => {
      let source = requestedSource
        ? sourceOptions.find((candidate) => candidate.id === requestedSource.id)
        : sources.initial
      source ??= sources.initial
      setActiveSource(source)
      let result = await getRepositoryWorktreeBootstrapPreflight(
        repoId,
        controller.signal,
        undefined,
        source.kind === 'branch' ? source.worktreePath : undefined,
      )
      if (controller.signal.aborted) return
      if (result.ok && !requestedSource && source.kind === 'branch' && result.preflight.candidates.length === 0) {
        source = sources.primary
        setActiveSource(source)
        result = await getRepositoryWorktreeBootstrapPreflight(repoId, controller.signal, undefined, undefined)
        if (controller.signal.aborted) return
      }
      setBootstrapPreflight(result.ok ? result.preflight : null)
      setBootstrapPreflightError(!result.ok)
    })()
      .catch(() => {
        if (!controller.signal.aborted) setBootstrapPreflightError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setBootstrapPreflightLoading(false)
      })
    return () => controller.abort()
  }, [bootstrapEnabled, open, repoId, requestedSource, sourceOptions, sources.initial, sources.primary])

  if (!repo) return null

  function resolveWorktreeBootstrapDecision(request: CreateWorktreeRequest): WorktreeBootstrapDecision {
    return request.selections.length > 0
      ? {
          kind: 'materialize',
          selections: request.selections,
          ...(request.sourceWorktreePath ? { sourceWorktreePath: request.sourceWorktreePath } : {}),
        }
      : { kind: 'skip' }
  }

  function handleCreate(request: CreateWorktreeRequest) {
    return onCreate(request, resolveWorktreeBootstrapDecision(request))
  }

  return (
    <CreateWorktreeDialog
      open={open}
      repo={repo}
      defaultBranch={defaultBranch}
      bootstrapEnabled={bootstrapEnabled}
      worktreeBootstrap={{
        loading: bootstrapPreflightLoading,
        preflight: bootstrapPreflight,
        error: bootstrapPreflightError,
        source: activeSource,
        sourceOptions,
      }}
      onBootstrapEnabledChange={setBootstrapEnabled}
      onBootstrapContextBranchChange={handleBootstrapContextBranchChange}
      onBootstrapSourceChange={setRequestedSource}
      onClose={onClose}
      onCreate={handleCreate}
    />
  )
}

function uniqueRepositoryDependencySources(
  sources: readonly RepositoryDependencySource[],
): RepositoryDependencySource[] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    if (seen.has(source.id)) return false
    seen.add(source.id)
    return true
  })
}
