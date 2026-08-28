import { createElement, useState } from 'react'
import type { ReactNode } from 'react'
import { GitBranch, GitMerge, RefreshCw, RotateCcw, SendHorizontal } from 'lucide-react'
import type { ExecResult } from '#/shared/git-types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import {
  CheckoutToDialog,
  CreateBranchDialog,
  MergeInDialog,
  MergeOutDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
import {
  useInlineCommitDraft,
  useInlineCommitDraftActions,
  useInlineCommitMessageProviders,
} from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
import {
  checkoutBranchInWorktree,
  commitRepositoryChanges,
  mergeRepositoryBranch,
  mergeRepositoryBranchOut,
  pullRepositoryBranch,
  getRepositoryRemoteAlignmentPreview,
  resetRepositoryHard,
} from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { toast } from 'sonner'
import type { BranchActionItem } from '#/web/hooks/useBranchActionItems.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import type { RepositoryBranchMergeOutExecuteInput } from '#/shared/repository-branch-merge.ts'
import { hasUnmergedStatusEntries } from '#/shared/git-conflicts.ts'
import {
  repositoryMergeBranchDisplayName,
  type RepositoryMergeBranchSelection,
} from '#/shared/repository-merge-branch.ts'
import { useTrackRemoteBranchAction } from '#/web/hooks/useRepositoryCreationActions.tsx'
import type { WorktreeBranchSwitchTarget } from '#/shared/worktree-branch-switch.ts'
import type { RepositoryRemoteAlignmentPreviewResult } from '#/shared/repository-remote-alignment.ts'

type RemoteAlignmentPreview = Extract<RepositoryRemoteAlignmentPreviewResult, { ok: true }>

interface BranchWriteActions {
  mainItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel?: ReactNode
}

interface BranchWriteActionOptions {
  canPush: boolean
  onPush: () => void
}

export function useBranchWriteActions(
  repo: BranchActionRepo,
  branch: RepoBranchState,
  options: BranchWriteActionOptions,
): BranchWriteActions {
  const t = useT()
  const setLastResult = useReposStore((s) => s.setLastResult)
  const runBranchAction = useReposStore((s) => s.runBranchAction)
  const allBranches = useReposStore((s) => s.repos[repo.id]?.data.branches ?? [])

  const worktreePath = branch.worktree?.path
  const hasWorktree = !!worktreePath
  const branchActionBusy = repo.operations.branchAction.phase !== 'idle'
  const inlineCommitDraft = useInlineCommitDraft(repo.id, worktreePath)
  const inlineCommitDraftActions = useInlineCommitDraftActions()
  const availableCommitMessageProviders = useInlineCommitMessageProviders()
  const sourceStatus = worktreePath ? repo.data.status.find((status) => status.path === worktreePath) : undefined
  const mergeOutSourceConflicted = Boolean(sourceStatus && hasUnmergedStatusEntries(sourceStatus.entries))
  const mergeOutSourceReady = Boolean(sourceStatus && !mergeOutSourceConflicted)

  const checkoutToDialog = useRetainedDialogState<string>()
  const mergeInDialog = useRetainedDialogState<string>()
  const mergeOutDialog = useRetainedDialogState<string>()
  const createBranchDialog = useRetainedDialogState<string>()
  const resetDialog = useRetainedDialogState<string>()
  const alignRemoteDialog = useRetainedDialogState<RemoteAlignmentPreview>()
  const [alignPreviewLoading, setAlignPreviewLoading] = useState(false)
  const trackRemoteBranch = useTrackRemoteBranchAction(repo)

  async function submitBranchWriteAction(action: Parameters<typeof runBranchAction>[1]) {
    const result = await runBranchAction(repo.id, action, { token: repo.instanceToken })
    if (!result) return
    if (!result.ok) throw new Error(result.message)
  }

  async function handleCheckoutTo(target: WorktreeBranchSwitchTarget) {
    if (!worktreePath) return
    const targetBranch = target.kind === 'localBranch' ? target.branch : target.localBranch
    const result = await checkoutBranchInWorktree(repo.id, worktreePath, target)
    setLastResult(repo.id, result, repo.instanceToken, {
      action: { kind: 'checkout', branch: targetBranch, worktreePath },
    })
    if (!result.ok) throw new Error(result.message)
    checkoutToDialog.close()
  }

  async function handleMerge(source: RepositoryMergeBranchSelection): Promise<ExecResult> {
    if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
    const result = await mergeRepositoryBranch(repo.id, worktreePath, source)
    setLastResult(repo.id, result, repo.instanceToken, {
      action: {
        kind: 'merge',
        branch: branch.name,
        sourceBranch: repositoryMergeBranchDisplayName(source),
        worktreePath,
      },
    })
    return result
  }

  async function handleMergeOut(input: RepositoryBranchMergeOutExecuteInput) {
    if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
    const result = await mergeRepositoryBranchOut(input)
    setLastResult(repo.id, result, repo.instanceToken, {
      action: {
        kind: 'mergeOut',
        branch: branch.name,
        destinationBranch: repositoryMergeBranchDisplayName(input.destination),
        worktreePath,
      },
    })
    return result
  }

  async function handlePull(): Promise<ExecResult> {
    if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
    const result = await pullRepositoryBranch(repo.id, branch.name, worktreePath)
    setLastResult(repo.id, result, repo.instanceToken, {
      action: { kind: 'pull', branch: branch.name, worktreePath },
    })
    return result
  }

  async function handleCommit(message: string) {
    if (!worktreePath) return
    const result = await commitRepositoryChanges(repo.id, worktreePath, message)
    setLastResult(repo.id, result, repo.instanceToken, {
      action: { kind: 'commit', branch: branch.name, message, worktreePath },
    })
    if (!result.ok) throw new Error(result.message)
  }

  async function handleCommitAndPush(message: string) {
    await handleCommit(message)
    options.onPush()
  }

  async function handleCreateBranch(newBranch: string) {
    await submitBranchWriteAction({ kind: 'createBranch', branch: newBranch, baseBranch: branch.name })
    createBranchDialog.close()
  }

  function handleResetHard() {
    if (!worktreePath) return
    void resetRepositoryHard(repo.id, worktreePath).then((result) => {
      setLastResult(repo.id, result, repo.instanceToken)
    })
    resetDialog.close()
  }

  async function handleAlignRemote() {
    const preview = alignRemoteDialog.payload
    if (!preview) return
    await submitBranchWriteAction({
      kind: 'alignRemote',
      branch: preview.branch,
      worktreePath: preview.worktreePath,
      previewToken: preview.token,
    })
    alignRemoteDialog.close()
  }

  async function openAlignRemotePreview() {
    if (!worktreePath || alignPreviewLoading) return
    setAlignPreviewLoading(true)
    try {
      const preview = await getRepositoryRemoteAlignmentPreview(repo.id, branch.name, worktreePath)
      if (!preview.ok) {
        setLastResult(repo.id, preview, repo.instanceToken)
        return
      }
      alignRemoteDialog.openWith(preview)
    } finally {
      setAlignPreviewLoading(false)
    }
  }

  const mainItems: BranchActionItem[] = [
    {
      id: 'createBranch',
      label: t('action.create-branch'),
      title: t('action.create-branch-title'),
      disabled: branchActionBusy,
      visible: true,
      icon: createElement(GitBranch),
      onSelect: () => createBranchDialog.openWith(''),
    },
    trackRemoteBranch.item,
    {
      id: 'checkoutTo',
      label: t('action.checkout-to'),
      title: t('action.checkout-to-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(GitBranch),
      onSelect: () => checkoutToDialog.openWith(''),
    },
    {
      id: 'merge',
      label: t('action.merge-in'),
      title: t('action.merge-in-title', { branch: branch.name }),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(GitMerge),
      onSelect: () => mergeInDialog.openWith(''),
    },
    {
      id: 'mergeOut',
      label: t('action.merge-out'),
      title: mergeOutSourceReady
        ? t('action.merge-out-title', { branch: branch.name })
        : t(sourceStatus ? 'action.merge-out-source-conflicted' : 'action.merge-out-source-unavailable'),
      disabled: !hasWorktree || !mergeOutSourceReady || branchActionBusy,
      visible: true,
      icon: createElement(GitMerge),
      onSelect: () => mergeOutDialog.openWith(''),
    },
    {
      id: 'commit',
      label: t('action.commit'),
      title: t('action.commit-title'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      icon: createElement(SendHorizontal),
      onSelect: () => {
        if (!worktreePath) return
        const worktreeStatus = repo.data.status.find((s) => s.path === worktreePath)
        if (!worktreeStatus || worktreeStatus.entries.length === 0) {
          toast.info(t('action.commit-no-changes'))
          return
        }
        inlineCommitDraftActions.openDraft(repo.id, worktreePath)
      },
    },
  ]

  const destructiveItems: BranchActionItem[] = [
    {
      id: 'alignRemote',
      label: t('action.align-remote'),
      title: branch.tracking
        ? t('action.align-remote-title', { upstream: branch.tracking })
        : t('action.align-remote-upstream-required'),
      disabled:
        !hasWorktree || !branch.tracking || branch.trackingGone === true || branchActionBusy || alignPreviewLoading,
      visible: true,
      destructive: true,
      icon: createElement(RefreshCw),
      onSelect: () => void openAlignRemotePreview(),
    },
    {
      id: 'resetHard',
      label: t('action.reset-hard'),
      disabled: !hasWorktree || branchActionBusy,
      visible: true,
      destructive: true,
      icon: createElement(RotateCcw),
      onSelect: () => resetDialog.openWith(''),
    },
  ]

  const dialogs = (
    <>
      <CreateBranchDialog
        open={createBranchDialog.open}
        branch={branch}
        allBranches={allBranches}
        busy={repo.operations.branchAction.phase !== 'idle'}
        onClose={createBranchDialog.close}
        onCreate={handleCreateBranch}
      />
      {trackRemoteBranch.dialog}
      <CheckoutToDialog
        open={checkoutToDialog.open}
        repoId={repo.id}
        branch={branch}
        allBranches={allBranches}
        onClose={checkoutToDialog.close}
        onCheckout={handleCheckoutTo}
      />
      <MergeInDialog
        open={mergeInDialog.open}
        repoId={repo.id}
        worktreePath={worktreePath ?? ''}
        branch={branch}
        allBranches={allBranches}
        onClose={mergeInDialog.close}
        onPull={options.canPush ? handlePull : undefined}
        onMerge={handleMerge}
        onPush={options.canPush ? options.onPush : undefined}
      />
      <MergeOutDialog
        open={mergeOutDialog.open}
        repoId={repo.id}
        sourceBranch={branch.name}
        sourceWorktreePath={worktreePath ?? ''}
        onClose={mergeOutDialog.close}
        onMergeOut={handleMergeOut}
      />
      <ConfirmDialog
        open={alignRemoteDialog.open}
        title={t('action.confirm-align-remote-title')}
        message={
          <div className="space-y-2">
            <p>{t('action.confirm-align-remote-body')}</p>
            <p>
              {t('action.confirm-align-remote-impact', {
                branch: alignRemoteDialog.payload?.branch ?? branch.name,
                upstream: alignRemoteDialog.payload?.upstream ?? '-',
                commits: alignRemoteDialog.payload?.ahead ?? 0,
                changes: alignRemoteDialog.payload?.changeCount ?? 0,
              })}
            </p>
          </div>
        }
        confirmLabel={t('action.confirm-align-remote-confirm')}
        destructive
        onCancel={alignRemoteDialog.close}
        onConfirm={handleAlignRemote}
      />
      <ConfirmDialog
        open={resetDialog.open}
        title={t('action.confirm-reset-hard-title')}
        message={t('action.confirm-reset-hard-body')}
        confirmLabel={t('action.confirm-reset-hard-confirm')}
        destructive
        onCancel={resetDialog.close}
        onConfirm={handleResetHard}
      />
    </>
  )

  const inlinePanel =
    inlineCommitDraft?.open && worktreePath ? (
      <InlineCommitForm
        message={inlineCommitDraft.message}
        error={inlineCommitDraft.error}
        availableProviders={availableCommitMessageProviders}
        generating={inlineCommitDraft.generating}
        pendingGeneratedMessage={inlineCommitDraft.pendingGeneratedMessage}
        onMessageChange={(message) => inlineCommitDraftActions.setMessage(repo.id, worktreePath, message)}
        onErrorChange={(error) => inlineCommitDraftActions.setError(repo.id, worktreePath, error)}
        onGenerate={(provider) =>
          inlineCommitDraftActions.generateMessage({
            repoId: repo.id,
            worktreePath,
            provider,
          })
        }
        onApplyPendingGeneratedMessage={() =>
          inlineCommitDraftActions.applyPendingGeneratedMessage(repo.id, worktreePath)
        }
        onClearPendingGeneratedMessage={() =>
          inlineCommitDraftActions.clearPendingGeneratedMessage(repo.id, worktreePath)
        }
        onClose={() => inlineCommitDraftActions.clearDraft(repo.id, worktreePath)}
        onCommit={handleCommit}
        onCommitAndPush={options.canPush ? handleCommitAndPush : undefined}
      />
    ) : null

  return { mainItems, destructiveItems, dialogs, inlinePanel }
}
