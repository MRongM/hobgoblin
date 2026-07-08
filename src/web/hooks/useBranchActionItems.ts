import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ExternalLink,
  FolderPlus,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { createElement, Fragment, useEffect, useState, type ReactNode } from 'react'
import { GitHubOutlineIcon } from '#/web/components/GitHubOutlineIcon.tsx'
import { GitLabLogoIcon } from '#/web/components/GitLabLogoIcon.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { useBranchActions, type BranchActionItemId } from '#/web/hooks/useBranchActions.tsx'
import { branchActionDisplayPhase, type BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { branchPullRequestBelongsToBranch } from '#/shared/git-types.ts'
import type { BrowserRemoteProvider } from '#/web/types.ts'
import { useRuntimeExternalAppSettings } from '#/web/runtime-settings-external-apps.ts'
import { useBranchWriteActions } from '#/web/hooks/useBranchWriteActions.tsx'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { CreateWorktreeDialog, type CreateWorktreeRequest } from '#/web/components/CreateWorktreeDialog.tsx'
import { getRepositoryWorktreeBootstrapPreview } from '#/web/repo-client.ts'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { isRepoWorktreeBootstrapConfigTrusted } from '#/shared/repo-settings.ts'
import type { WorktreeBootstrapDecision, WorktreeBootstrapPreview } from '#/shared/worktree-bootstrap-summary.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { useTerminalSessionContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'
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

export function useBranchActionItems(repo: BranchActionRepo, branch: RepoBranchState): BranchActionItemGroups {
  const t = useT()
  const syncAndRefresh = useReposStore((s) => s.syncAndRefresh)
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const { terminalApp, resolvedTerminalApp, terminalAvailable, editorApp, resolvedEditorApp, editorAvailable } =
    useRuntimeExternalAppSettings()
  const { blocked, busyAction, capabilities, actions, dialogs } = useBranchActions(repo, branch)
  const writeActions = useBranchWriteActions(repo, branch, {
    canPush: capabilities.canPush,
    onPush: actions.push,
  })
  const createWorktreeDialog = useRetainedDialogState<string>()
  const closeAllTerminalsConfirm = useRetainedDialogState<string>()
  const { closeTerminalAndDismissDetailIfLast } = useTerminalSessionContext()
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
  const pullRequest =
    branch.pullRequest && branchPullRequestBelongsToBranch(branch, branch.pullRequest) ? branch.pullRequest : undefined
  const remoteIcon = pullRequest ? GitPullRequest : browserRemoteIcon(branchBrowserRemoteProvider(repo, branch))
  const isRemoteRepo = !!repo.remote.target
  const showTerminalAction = capabilities.canOpenTerminal && (isRemoteRepo || terminalAvailable)
  const terminalIconPref = isRemoteRepo ? 'auto' : (resolvedTerminalApp ?? terminalApp)
  const terminalBase: TerminalSessionBase | null = branch.worktree?.path
    ? { repoRoot: repo.id, branch: branch.name, worktreePath: branch.worktree.path }
    : null
  const terminalWorktreeKey = terminalBase ? worktreeTerminalKey(terminalBase.repoRoot, terminalBase.worktreePath) : null
  const terminalSessions = useWorktreeTerminalSnapshot(terminalWorktreeKey).sessions

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

  function requestCloseAllTerminals(): void {
    if (disabled || !terminalBase || terminalSessions.length === 0) return
    closeAllTerminalsConfirm.openWith(terminalBase.worktreePath)
  }

  function closeAllTerminals(): void {
    if (!terminalBase) return
    closeAllTerminalsConfirm.close()
    for (const session of terminalSessions) {
      closeTerminalAndDismissDetailIfLast(session.key, terminalBase)
    }
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
      label: t('worktrees.open-in-terminal-label'),
      disabled: disabled || !showTerminalAction,
      busy: busy('terminal'),
      visible: true,
      shortcut: 'G',
      icon: createElement(TerminalAppIcon, { pref: terminalIconPref }),
      onSelect: actions.openTerminal,
    },
    {
      id: 'remote',
      label: pullRequest ? t('action.remote-pr', { n: pullRequest.number }) : t('action.remote'),
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
      label: t('terminal.close-all'),
      disabled: disabled || terminalSessions.length === 0,
      visible: terminalSessions.length > 0,
      destructive: true,
      menuOnly: true,
      icon: createElement(X),
      onSelect: requestCloseAllTerminals,
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
    patchItems: [],
    mainItems: [...mainItems, ...writeActions.mainItems, copyPatchItem],
    externalItems,
    destructiveItems: [...destructiveItems, ...writeActions.destructiveItems],
    dialogs: createElement(
      Fragment,
      null,
      dialogs,
      writeActions.dialogs,
      createElement(ConfirmDialog, {
        open: closeAllTerminalsConfirm.open,
        title: t('terminal.close-all-confirm-title'),
        message: t('terminal.close-all-confirm-body', { count: terminalSessions.length }),
        confirmLabel: t('terminal.close-all-confirm-confirm'),
        destructive: true,
        onCancel: closeAllTerminalsConfirm.close,
        onConfirm: closeAllTerminals,
      }),
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
  const [bootstrapPreview, setBootstrapPreview] = useState<WorktreeBootstrapPreview | null>(null)
  const [bootstrapPreviewError, setBootstrapPreviewError] = useState(false)
  const [bootstrapPreviewLoading, setBootstrapPreviewLoading] = useState(false)
  const [configTrustChoice, setConfigTrustChoice] = useState<boolean | null>(null)
  const settingsQuery = useSettingsSnapshotQuery()

  useEffect(() => {
    if (!open) {
      setBootstrapPreview(null)
      setBootstrapPreviewError(false)
      setBootstrapPreviewLoading(false)
      setConfigTrustChoice(null)
      return
    }
    const controller = new AbortController()
    setBootstrapPreview(null)
    setBootstrapPreviewError(false)
    setBootstrapPreviewLoading(true)
    setConfigTrustChoice(null)
    void getRepositoryWorktreeBootstrapPreview(repoId, controller.signal)
      .then((result) => {
        setBootstrapPreview(result.ok ? result.preview : null)
        setBootstrapPreviewError(!result.ok)
      })
      .catch(() => {
        if (!controller.signal.aborted) setBootstrapPreviewError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setBootstrapPreviewLoading(false)
      })
    return () => controller.abort()
  }, [open, repoId])

  if (!repo) return null

  function resolveWorktreeBootstrapDecision(): WorktreeBootstrapDecision {
    const configHash = bootstrapPreview?.hasOperations ? bootstrapPreview.configHash : null
    if (!configHash) return { kind: 'skip' }
    const repoSettings = settingsQuery.data?.repoSettings ?? []
    const trusted = configTrustChoice ?? isRepoWorktreeBootstrapConfigTrusted(repoSettings, repoId, configHash)
    return { kind: 'run', configHash, configTrusted: trusted }
  }

  function handleCreate(request: CreateWorktreeRequest) {
    return onCreate(request, resolveWorktreeBootstrapDecision())
  }

  const configHash = bootstrapPreview?.configHash
  const configTrusted =
    configTrustChoice ??
    isRepoWorktreeBootstrapConfigTrusted(settingsQuery.data?.repoSettings ?? [], repoId, configHash)

  return createElement(CreateWorktreeDialog, {
    open,
    repo,
    defaultBranch,
    worktreeBootstrap: {
      loading:
        bootstrapPreviewLoading ||
        (bootstrapPreview?.hasOperations === true && !!bootstrapPreview.configHash && settingsQuery.isLoading),
      preview: bootstrapPreview,
      error: bootstrapPreviewError,
      configTrusted,
      onConfigTrustedChange: setConfigTrustChoice,
    },
    onClose,
    onCreate: handleCreate,
  })
}
