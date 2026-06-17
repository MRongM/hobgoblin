import { createElement } from 'react'
import type { ReactNode } from 'react'
import { GitBranch, GitMerge, RadioTower, RotateCcw, SendHorizontal } from 'lucide-react'
import type { ExecResult } from '#/shared/git-types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useRetainedDialogState } from '#/web/hooks/useRetainedDialogState.ts'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import {
  CheckoutToDialog,
  CreateBranchDialog,
  MergeDialog,
  PullRemoteBranchDialog,
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
  resetRepositoryHard,
} from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import type { BranchActionItem } from '#/web/hooks/useBranchActionItems.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

interface BranchWriteActions {
  mainItems: BranchActionItem[]
  destructiveItems: BranchActionItem[]
  dialogs: ReactNode
  inlinePanel?: ReactNode
}

export function useBranchWriteActions(repo: BranchActionRepo, branch: RepoBranchState): BranchWriteActions {
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

  const checkoutToDialog = useRetainedDialogState<string>()
  const mergeDialog = useRetainedDialogState<string>()
  const createBranchDialog = useRetainedDialogState<string>()
  const pullRemoteBranchDialog = useRetainedDialogState<string>()
  const resetDialog = useRetainedDialogState<string>()

  async function submitBranchWriteAction(action: Parameters<typeof runBranchAction>[1]) {
    const result = await runBranchAction(repo.id, action, { token: repo.instanceToken })
    if (!result) return
    if (!result.ok) throw new Error(result.message)
  }

  async function handleCheckoutTo(targetBranch: string) {
    if (!worktreePath) return
    const result = await checkoutBranchInWorktree(repo.id, worktreePath, targetBranch)
    setLastResult(repo.id, result, repo.instanceToken)
    if (!result.ok) throw new Error(result.message)
    checkoutToDialog.close()
  }

  async function handleMerge(sourceBranch: string): Promise<ExecResult> {
    if (!worktreePath) return { ok: false, message: 'error.invalid-arguments' }
    const result = await mergeRepositoryBranch(repo.id, worktreePath, sourceBranch)
    setLastResult(repo.id, result, repo.instanceToken)
    if (result.ok) mergeDialog.close()
    return result
  }

  async function handleCommit(message: string) {
    if (!worktreePath) return
    const result = await commitRepositoryChanges(repo.id, worktreePath, message)
    setLastResult(repo.id, result, repo.instanceToken)
    if (!result.ok) throw new Error(result.message)
  }

  async function handleCreateBranch(newBranch: string) {
    await submitBranchWriteAction({ kind: 'createBranch', branch: newBranch, baseBranch: branch.name })
    createBranchDialog.close()
  }

  async function handleTrackRemoteBranch(input: { localBranch: string; remoteRef: string }) {
    await submitBranchWriteAction({
      kind: 'trackRemoteBranch',
      localBranch: input.localBranch,
      remoteRef: input.remoteRef,
    })
    pullRemoteBranchDialog.close()
  }

  function handleResetHard() {
    if (!worktreePath) return
    void resetRepositoryHard(repo.id, worktreePath).then((result) => {
      setLastResult(repo.id, result, repo.instanceToken)
    })
    resetDialog.close()
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
    {
      id: 'pullRemoteBranch',
      label: t('action.pull-remote-branch'),
      title: t('action.pull-remote-branch-title'),
      disabled: repo.remote.hasRemotes === false || branchActionBusy,
      visible: repo.remote.hasRemotes !== false,
      icon: createElement(RadioTower),
      onSelect: () => pullRemoteBranchDialog.openWith(''),
    },
    {
      id: 'checkoutTo',
      label: t('action.checkout-to'),
      title: t('action.checkout-to-title'),
      disabled: branchActionBusy,
      visible: hasWorktree,
      icon: createElement(GitBranch),
      onSelect: () => checkoutToDialog.openWith(''),
    },
    {
      id: 'merge',
      label: t('action.merge'),
      title: t('action.merge-title'),
      disabled: branchActionBusy,
      visible: hasWorktree,
      icon: createElement(GitMerge),
      onSelect: () => mergeDialog.openWith(''),
    },
    {
      id: 'commit',
      label: t('action.commit'),
      title: t('action.commit-title'),
      disabled: branchActionBusy,
      visible: hasWorktree,
      icon: createElement(SendHorizontal),
      onSelect: () => {
        if (worktreePath) inlineCommitDraftActions.openDraft(repo.id, worktreePath)
      },
    },
  ]

  const destructiveItems: BranchActionItem[] = [
    {
      id: 'resetHard',
      label: t('action.reset-hard'),
      disabled: branchActionBusy,
      visible: hasWorktree,
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
      <PullRemoteBranchDialog
        open={pullRemoteBranchDialog.open}
        repoId={repo.id}
        allBranches={allBranches}
        busy={repo.operations.branchAction.phase !== 'idle'}
        onClose={pullRemoteBranchDialog.close}
        onTrack={handleTrackRemoteBranch}
      />
      <CheckoutToDialog
        open={checkoutToDialog.open}
        branch={branch}
        allBranches={allBranches}
        onClose={checkoutToDialog.close}
        onCheckout={handleCheckoutTo}
      />
      <MergeDialog
        open={mergeDialog.open}
        repoId={repo.id}
        worktreePath={worktreePath ?? ''}
        branch={branch}
        allBranches={allBranches}
        onClose={mergeDialog.close}
        onMerge={handleMerge}
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
        onApplyPendingGeneratedMessage={() => inlineCommitDraftActions.applyPendingGeneratedMessage(repo.id, worktreePath)}
        onClearPendingGeneratedMessage={() =>
          inlineCommitDraftActions.clearPendingGeneratedMessage(repo.id, worktreePath)
        }
        onClose={() => inlineCommitDraftActions.clearDraft(repo.id, worktreePath)}
        onCommit={handleCommit}
      />
    ) : null

  return { mainItems, destructiveItems, dialogs, inlinePanel }
}
