import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ExternalLink,
  FolderPlus,
  GitBranch,
  RefreshCw,
  Tag,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import { createElement, Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GitHubOutlineIcon } from '#/web/components/GitHubOutlineIcon.tsx'
import { GitLabLogoIcon } from '#/web/components/GitLabLogoIcon.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { CreateTagDialog } from '#/web/components/CreateTagDialog.tsx'
import { useBranchActions, type BranchActionItemId } from '#/web/hooks/useBranchActions.tsx'
import { branchActionDisplayPhase, type BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { BrowserRemoteProvider } from '#/web/types.ts'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
import { useBranchWriteActions } from '#/web/hooks/useBranchWriteActions.tsx'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { CreateWorktreeDialog, type CreateWorktreeRequest } from '#/web/components/CreateWorktreeDialog.tsx'
import { createRepositoryLocalTag, getRepositoryWorktreeBootstrapPreflight } from '#/web/repo-client.ts'
import type { WorktreeBootstrapDecision, WorktreeBootstrapPreflight } from '#/shared/worktree-bootstrap-summary.ts'
import {
  repositoryDependencySources,
  type RepositoryDependencySource,
} from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
import type { TerminalLaunchMode } from '#/shared/terminal.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useCloseTerminalScope } from '#/web/components/terminal/TerminalScopeContextMenu.tsx'
export interface BranchActionItem {
  id: BranchActionItemId
  label: string
  title?: string
  ariaLabel?: string
  disabled: boolean
  busy?: boolean
  visible: boolean
  destructive?: boolean
  menuOnly?: boolean
  shortcut?: string
  icon: ReactNode
  onSelect: () => void | Promise<void>
}

export interface BranchActionItemGroups {
  patchItems: BranchActionItem[]
  mainItems: BranchActionItem[]
  externalItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel?: ReactNode
}

export interface UseBranchActionItemsOptions {
  onNavigateToInternalTerminal?: (target: TerminalSessionBase) => void | Promise<void>
}

export function visibleBranchActionItems({
  patchItems,
  mainItems,
  externalItems,
  destructiveItems,
}: Pick<
  BranchActionItemGroups,
  'patchItems' | 'mainItems' | 'externalItems' | 'destructiveItems'
>): BranchActionItem[] {
  return [...externalItems, ...mainItems, ...patchItems, ...destructiveItems].filter(
    (item) => item.visible && !item.menuOnly,
  )
}

export function branchBrowserRemoteProvider(
  repo: BranchActionRepo,
  branch: RepoBranchState,
): BrowserRemoteProvider | undefined {
  const providers = repo.remote.remoteProviders
  if (branch.tracking && providers) {
    const remoteName = Object.keys(providers)
      .filter((remote) => branch.tracking === remote || branch.tracking!.startsWith(`${remote}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (remoteName) return providers[remoteName]
  }
  return repo.remote.browserRemoteProvider
}

function browserRemoteIcon(provider: BrowserRemoteProvider | undefined) {
  if (provider === 'github') return GitHubOutlineIcon
  if (provider === 'gitlab') return GitLabLogoIcon
  return ExternalLink
}

export function useBranchActionItems(
  repo: BranchActionRepo,
  branch: RepoBranchState,
  options: UseBranchActionItemsOptions = {},
): BranchActionItemGroups {
  const t = useT()
  const syncAndRefresh = useReposStore((s) => s.syncAndRefresh)
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const setDetailCollapsed = useReposStore((s) => s.setDetailCollapsed)
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()
  const navigation = useMainWindowNavigation()
  const { blocked, busyAction, capabilities, actions, dialogs } = useBranchActions(repo, branch)
  const writeActions = useBranchWriteActions(repo, branch, {
    canPush: capabilities.canPush,
    onPush: actions.push,
  })
  const createWorktreeDialog = useRetainedDialogState<string>()
  const createTagDialog = useRetainedDialogState<string>()
  const { createTerminal, restoreTmuxSessions } = useTerminalSessionContext()
  const disabled = blocked
  const busy = (id: BranchActionItemId) => busyAction === id
  const phase = branchActionDisplayPhase(repo, branch.name)
  const createWorktreePhase =
    repo.operations.branchAction.reason === 'branch:createWorktree' ? branchActionDisplayPhase(repo, branch.name) : null
  const createWorktreeBusy = createWorktreePhase !== null
  const syncBusy = repo.operations.manualRefresh.phase !== 'idle' || repo.operations.fetch.phase !== 'idle'
  const branchActionLabel = (
    id: BranchActionItemId,
    idleKey: string,
    loadingKey: string,
    queuedKey?: string,
  ): string => {
    const itemBusy = busy(id) || (id === 'createWorktree' && createWorktreeBusy)
    if (!itemBusy) return t(idleKey)
    const itemPhase = id === 'createWorktree' ? createWorktreePhase : phase
    if (itemPhase === 'queued' && queuedKey) return t(queuedKey)
    return t(loadingKey)
  }
  const remoteIcon = browserRemoteIcon(branchBrowserRemoteProvider(repo, branch))
  const isRemoteRepo = !!repo.remote.target
  const showExternalTerminalAction = capabilities.canOpenTerminal && (isRemoteRepo || terminalAvailable)
  const terminalIconPref = isRemoteRepo ? 'auto' : (resolvedTerminalApp ?? terminalApp)
  const terminalBase: TerminalSessionBase | null = branch.worktree?.path
    ? { repoRoot: repo.id, branch: branch.name, worktreePath: branch.worktree.path }
    : null
  const terminalWorktreeKey = terminalBase
    ? worktreeTerminalKey(terminalBase.repoRoot, terminalBase.worktreePath)
    : null
  const terminalWorktreeKeys = useMemo(() => (terminalWorktreeKey ? [terminalWorktreeKey] : []), [terminalWorktreeKey])
  const closeTerminalScope = useCloseTerminalScope(terminalWorktreeKeys)

  function handleCreateWorktree(request: CreateWorktreeRequest, worktreeBootstrap: WorktreeBootstrapDecision): void {
    if (blocked) return
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

  async function handleNewTerminal(launchMode: TerminalLaunchMode): Promise<void> {
    if (!terminalBase) return
    if (options.onNavigateToInternalTerminal) await options.onNavigateToInternalTerminal(terminalBase)
    else navigation.showRepoBranchDetailTab(repo.id, branch.name, 'terminal')
    setDetailCollapsed(false)
    await createTerminal(terminalBase, launchMode)
  }

  async function handleRestoreTmuxTerminals(): Promise<void> {
    if (!terminalBase) return
    if (options.onNavigateToInternalTerminal) await options.onNavigateToInternalTerminal(terminalBase)
    else navigation.showRepoBranchDetailTab(repo.id, branch.name, 'terminal')
    setDetailCollapsed(false)
    await restoreTmuxSessions(terminalBase)
  }

  async function handleSync(): Promise<void> {
    if (blocked || syncBusy) return
    await syncAndRefresh(repo.id, { token: repo.instanceToken })
  }

  const copyPatchItem: BranchActionItem = {
    id: 'copyPatch',
    label: t('status.copy-patch'),
    title: t('status.copy-patch-title'),
    ariaLabel: t('status.copy-patch-title'),
    disabled: disabled || !capabilities.canCopyPatch,
    busy: busy('copyPatch'),
    visible: true,
    icon: createElement(ClipboardCopy),
    onSelect: actions.copyPatch,
  }

  const createTagTarget = branch.lastCommitHash.trim()
  const createTagItem: BranchActionItem = {
    id: 'createTag',
    label: t('action.create-tag'),
    disabled: disabled || busyAction !== null,
    visible: createTagTarget.length > 0,
    icon: createElement(Tag),
    onSelect: () => createTagDialog.openWith(createTagTarget),
  }

  const mainItems: BranchActionItem[] = [
    {
      id: 'checkout',
      label: branchActionLabel('checkout', 'action.checkout', 'action.checkout-loading', 'action.checkout-queued'),
      disabled: disabled || capabilities.isCurrent || capabilities.checkedOutInAnotherWorktree,
      busy: busy('checkout'),
      visible: false,
      shortcut: '↩',
      icon: createElement(GitBranch),
      onSelect: actions.checkout,
    },
    {
      id: 'pull',
      label: branchActionLabel('pull', 'action.pull', 'action.pull-loading', 'action.pull-queued'),
      disabled: disabled || !capabilities.canPull,
      busy: busy('pull'),
      visible: true,
      shortcut: 'P',
      icon: createElement(ArrowDown),
      onSelect: actions.pull,
    },
    {
      id: 'push',
      label: branchActionLabel('push', 'action.push', 'action.push-loading', 'action.push-queued'),
      disabled: disabled || !capabilities.canPush,
      busy: busy('push'),
      visible: true,
      shortcut: '⇧P',
      icon: createElement(ArrowUp),
      onSelect: actions.push,
    },
    {
      id: 'createWorktree',
      label: branchActionLabel(
        'createWorktree',
        'action.create-worktree',
        'action.create-worktree-creating-title',
        'action.create-worktree-queued-title',
      ),
      title: t('action.create-worktree-title'),
      disabled,
      busy: createWorktreeBusy,
      visible: true,
      icon: createElement(FolderPlus),
      onSelect: () => createWorktreeDialog.openWith(branch.name),
    },
    {
      id: 'sync',
      label: t('action.refresh'),
      title: t('action.fetch-title'),
      disabled: disabled || syncBusy,
      busy: syncBusy,
      visible: true,
      icon: createElement(RefreshCw),
      onSelect: handleSync,
    },
  ]

  const externalItems: BranchActionItem[] = [
    {
      id: 'editor',
      label: t('worktrees.open-in-editor-label'),
      disabled: disabled || !capabilities.canOpenEditor || !editorAvailable,
      busy: busy('editor'),
      visible: true,
      shortcut: 'V',
      icon: createElement(EditorAppIcon, { pref: resolvedEditorApp ?? editorApp }),
      onSelect: actions.openEditor,
    },
    {
      id: 'terminal',
      label: t('terminal.internal'),
      title: t('terminal.internal'),
      ariaLabel: t('terminal.internal'),
      disabled: disabled || !terminalBase,
      visible: true,
      icon: createElement(Terminal),
      onSelect: () => handleNewTerminal('native'),
    },
    {
      id: 'terminalTmux',
      label: t('terminal.new-with-tmux'),
      title: t('terminal.new-with-tmux'),
      ariaLabel: t('terminal.new-with-tmux'),
      disabled: disabled || !terminalBase,
      visible: true,
      menuOnly: true,
      icon: createElement(Terminal),
      onSelect: () => handleNewTerminal('tmux-if-available'),
    },
    {
      id: 'restoreTmuxTerminals',
      label: t('terminal.restore-directory-tmux'),
      title: t('terminal.restore-directory-tmux'),
      ariaLabel: t('terminal.restore-directory-tmux'),
      disabled: disabled || !terminalBase,
      visible: true,
      menuOnly: true,
      icon: createElement(Terminal),
      onSelect: handleRestoreTmuxTerminals,
    },
    {
      id: 'externalTerminal',
      label: t('terminal.external'),
      title: t('terminal.external'),
      ariaLabel: t('terminal.external'),
      disabled: disabled || !showExternalTerminalAction,
      busy: busy('externalTerminal'),
      visible: true,
      shortcut: 'G',
      icon: createElement(TerminalAppIcon, { pref: terminalIconPref }),
      onSelect: actions.openExternalTerminal,
    },
    {
      id: 'remote',
      label: t('action.remote'),
      disabled: disabled || !capabilities.canOpenRemote,
      busy: busy('remote'),
      visible: true,
      shortcut: '⇧G',
      icon: createElement(remoteIcon),
      onSelect: actions.openRemote,
    },
  ]

  const destructiveItems: BranchActionItem[] = [
    {
      id: 'closeAllTerminals',
      label: closeTerminalScope.label,
      disabled: disabled || closeTerminalScope.disabled,
      visible: closeTerminalScope.count > 0,
      destructive: true,
      menuOnly: true,
      icon: createElement(X),
      onSelect: closeTerminalScope.requestClose,
    },
    {
      id: 'removeWorktree',
      label: branchActionLabel(
        'removeWorktree',
        'action.remove-worktree',
        'action.remove-worktree-removing-title',
        'action.remove-worktree-queued-title',
      ),
      disabled: disabled || !capabilities.canRemoveWorktree,
      busy: busy('removeWorktree'),
      visible: true,
      destructive: true,
      icon: createElement(Trash2),
      onSelect: actions.requestRemoveWorktree,
    },
    {
      id: 'cleanupWorktree',
      label: branchActionLabel(
        'cleanupWorktree',
        'action.cleanup-invalid-worktree',
        'action.cleanup-invalid-worktree-cleaning-title',
        'action.cleanup-invalid-worktree-queued-title',
      ),
      disabled: disabled || !capabilities.canCleanupWorktree,
      busy: busy('cleanupWorktree'),
      visible: capabilities.canCleanupWorktree,
      destructive: true,
      icon: createElement(Trash2),
      onSelect: actions.requestCleanupWorktree,
    },
    {
      id: 'deleteBranch',
      label: branchActionLabel(
        'deleteBranch',
        'action.delete-branch',
        'action.delete-branch-deleting-title',
        'action.delete-branch-queued-title',
      ),
      disabled: disabled || !capabilities.isRegularBranch,
      busy: busy('deleteBranch'),
      visible: true,
      destructive: true,
      icon: createElement(Trash2),
      onSelect: actions.requestDeleteBranch,
    },
  ]

  return {
    patchItems: [createTagItem],
    mainItems: [...mainItems, ...writeActions.mainItems, copyPatchItem],
    externalItems,
    destructiveItems: [...destructiveItems, ...writeActions.destructiveItems],
    dialogs: createElement(
      Fragment,
      null,
      dialogs,
      writeActions.dialogs,
      createElement(CreateTagDialogConnected, {
        open: createTagDialog.open,
        defaultRef: createTagDialog.payload ?? 'HEAD',
        onClose: createTagDialog.close,
        onCreate: async ({ name, ref }) => {
          const result = await createRepositoryLocalTag(repo.id, name, ref, undefined, String(repo.instanceToken))
          if (!result.ok) throw new Error(t(result.message))
        },
      }),
      closeTerminalScope.dialog,
      createElement(CreateWorktreeDialogConnected, {
        repoId: repo.id,
        defaultBranch: createWorktreeDialog.payload ?? undefined,
        open: createWorktreeDialog.open,
        onClose: createWorktreeDialog.close,
        onCreate: handleCreateWorktree,
      }),
    ),
    inlinePanel: writeActions.inlinePanel,
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
  const repo = useReposStore((s) => s.repos[repoId])
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
      setBootstrapPreflight(null)
      setBootstrapPreflightError(false)
      setBootstrapPreflightLoading(false)
      setSourceContextBranch(undefined)
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
  }, [open, repoId, requestedSource, sourceOptions, sources.initial, sources.primary])

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

  return createElement(CreateWorktreeDialog, {
    open,
    repo,
    defaultBranch,
    worktreeBootstrap: {
      loading: bootstrapPreflightLoading,
      preflight: bootstrapPreflight,
      error: bootstrapPreflightError,
      source: activeSource,
      sourceOptions,
    },
    onBootstrapContextBranchChange: handleBootstrapContextBranchChange,
    onBootstrapSourceChange: setRequestedSource,
    onClose,
    onCreate: handleCreate,
  })
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

function CreateTagDialogConnected({
  open,
  defaultRef,
  onClose,
  onCreate,
}: {
  open: boolean
  defaultRef?: string
  onClose: () => void
  onCreate: (request: { name: string; ref: string }) => void | Promise<void>
}) {
  return <CreateTagDialog open={open} defaultRef={defaultRef} onClose={onClose} onCreate={onCreate} />
}
