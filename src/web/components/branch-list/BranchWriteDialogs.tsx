import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  buildMergeConflictAiCommand,
  buildMergeConflictAiPrompt,
  prefillAiTerminalCommand,
} from '#/web/ai-terminal-handoff.ts'
import { MergeConflictAiActions } from '#/web/components/MergeConflictAiActions.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldDescription, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'
import { getRepositoryBranchMergeOutPlan, getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import type {
  RepositoryBranchMergeOutExecuteInput,
  RepositoryBranchMergeOutPlan,
  RepositoryBranchMergeOutResult,
} from '#/shared/repository-branch-merge.ts'
import {
  repositoryMergeBranchDisplayName,
  repositoryMergeBranchSelectionKey,
  type RepositoryMergeBranchSelection,
} from '#/shared/repository-merge-branch.ts'
import {
  branchNameValidationKey,
  remoteRefMatchesQuery,
  remoteTrackingBranchChoices,
} from '#/web/components/branch-list/branch-create-model.ts'

// ── Checkout-to dialog ────────────────────────────────────────────────────────

interface CheckoutToDialogProps {
  open: boolean
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  onClose: () => void
  onCheckout: (targetBranch: string) => Promise<void>
}

export function CheckoutToDialog({ open, branch, allBranches, onClose, onCheckout }: CheckoutToDialogProps) {
  const t = useT()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'checkout'>()

  const candidates = allBranches.filter((b) => b.name !== branch.name)

  useEffect(() => {
    if (!open) {
      setSelected('')
      setError(null)
    }
  }, [open])

  async function handleConfirm() {
    if (!selected) return
    setError(null)
    await run('checkout', async () => {
      try {
        await onCheckout(selected)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) onClose()
      }}
      title={t('action.checkout-to-title')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="checkout-to-select">{t('action.checkout-to-label')}</FieldLabel>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="checkout-to-select" className="w-full">
              <SelectValue placeholder={t('action.checkout-to-placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((b) => (
                <SelectItem key={b.name} value={b.name} textValue={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!selected || isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('action.checkout-to-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

// ── Merge dialog ──────────────────────────────────────────────────────────────

interface MergeInDialogProps {
  open: boolean
  repoId: string
  worktreePath: string
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  onClose: () => void
  onPull?: () => Promise<ExecResult>
  onMerge: (source: RepositoryMergeBranchSelection) => Promise<ExecResult>
  onPush?: () => void | Promise<void>
}

export function MergeInDialog({
  open,
  repoId,
  worktreePath,
  branch,
  allBranches,
  onClose,
  onPull,
  onMerge,
  onPush,
}: MergeInDialogProps) {
  const t = useT()
  const [selected, setSelected] = useState('')
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [branchQuery, setBranchQuery] = useState('')
  const [remoteState, setRemoteState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorReason, setErrorReason] = useState<ExecResult['reason'] | null>(null)
  const { pending, isPending, run } = useAsyncPending<'merge' | 'pullMergePush'>()

  const candidates: RepositoryMergeBranchSelection[] = [
    ...allBranches
      .filter((candidate) => candidate.name !== branch.name)
      .map((candidate) => ({ kind: 'local' as const, branch: candidate.name })),
    ...remoteBranches.map((remoteRef) => ({ kind: 'remote' as const, remoteRef })),
  ]
  const selectedSource = candidates.find((candidate) => repositoryMergeBranchSelectionKey(candidate) === selected)
  const remoteSelected = selectedSource?.kind === 'remote'

  useEffect(() => {
    if (!open) {
      setSelected('')
      setRemoteBranches([])
      setBranchQuery('')
      setRemoteState('idle')
      setError(null)
      setErrorReason(null)
      return
    }

    const controller = new AbortController()
    setSelected('')
    setRemoteBranches([])
    setBranchQuery('')
    setRemoteState('loading')
    void getRepositoryRemoteBranches(repoId, controller.signal)
      .then((branches) => {
        if (controller.signal.aborted) return
        setRemoteBranches(branches)
        setRemoteState('loaded')
      })
      .catch(() => {
        if (!controller.signal.aborted) setRemoteState('error')
      })
    return () => controller.abort()
  }, [open, repoId])

  async function handleConfirm(mode: 'merge' | 'pullMergePush' = 'merge') {
    if (!selectedSource) return
    setError(null)
    setErrorReason(null)
    await run(mode, async () => {
      try {
        if (mode === 'pullMergePush' && onPull) {
          const pullResult = await onPull()
          if (!pullResult.ok) {
            setError(pullResult.message)
            setErrorReason(pullResult.reason ?? null)
            return
          }
        }
        const result = await onMerge(selectedSource)
        if (!result.ok) {
          setError(result.message)
          setErrorReason(result.reason ?? null)
          return
        }
        if (mode === 'pullMergePush') await onPush?.()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setErrorReason(null)
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isPending) onClose()
      }}
      title={t('action.merge-in-title', { branch: branch.name })}
    >
      <form
        data-slot="merge-dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="min-w-0 space-y-4"
      >
        <Field data-slot="merge-dialog-branch-field" className="min-w-0">
          <FieldLabel htmlFor="merge-select">{t('action.merge-in-label')}</FieldLabel>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="merge-select" className="min-w-0 w-full">
              <SelectValue placeholder={t('action.merge-in-placeholder')} />
            </SelectTrigger>
            <SelectContent
              header={
                <RemoteBranchSearchInput
                  id="merge-in-branch-search"
                  value={branchQuery}
                  placeholder={t('branches.search-placeholder')}
                  ariaLabel={t('branches.search-label')}
                  onChange={setBranchQuery}
                />
              }
            >
              {candidates
                .filter((candidate) => mergeBranchMatchesQuery(candidate, branchQuery))
                .map((candidate) => {
                  const key = repositoryMergeBranchSelectionKey(candidate)
                  const name = candidate.kind === 'local' ? candidate.branch : candidate.remoteRef
                  const text = candidate.kind === 'remote' ? `${name} (${t('tab.remote-branches')})` : name
                  return (
                    <SelectItem
                      key={key}
                      value={key}
                      textValue={text}
                      data-merge-source-key={key}
                      data-merge-source-kind={candidate.kind}
                    >
                      {text}
                    </SelectItem>
                  )
                })}
            </SelectContent>
          </Select>
          {remoteState === 'loading' && <FieldDescription>{t('action.merge-in-remote-loading')}</FieldDescription>}
          {remoteState === 'loaded' && remoteBranches.length === 0 && (
            <FieldDescription>{t('action.merge-in-remote-empty')}</FieldDescription>
          )}
          {remoteState === 'error' && <FieldDescription>{t('action.merge-in-remote-load-failed')}</FieldDescription>}
          {remoteSelected && <FieldDescription>{t('action.merge-in-remote-fetch-note')}</FieldDescription>}
        </Field>
        {error && <MergeDialogError>{error.startsWith('error.merge-out') ? t(error) : error}</MergeDialogError>}
        {errorReason === 'merge-conflict' && (
          <WorktreeMergeConflictAiActions
            repoId={repoId}
            branch={branch.name}
            worktreePath={worktreePath}
            onClose={onClose}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          {onPull && onPush && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedSource || isPending}
              onClick={() => void handleConfirm('pullMergePush')}
            >
              {pending === 'pullMergePush' && <Loader2 className="animate-spin" />}
              {t(remoteSelected ? 'action.merge-in-remote-and-push-confirm' : 'action.merge-in-and-push-confirm')}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!selectedSource || isPending}>
            {pending === 'merge' && <Loader2 className="animate-spin" />}
            {t(remoteSelected ? 'action.merge-in-remote-confirm' : 'action.merge-in-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

interface MergeOutDialogProps {
  open: boolean
  repoId: string
  sourceBranch: string
  sourceWorktreePath: string
  onClose: () => void
  onMergeOut: (input: RepositoryBranchMergeOutExecuteInput) => Promise<RepositoryBranchMergeOutResult>
}

export function MergeOutDialog({
  open,
  repoId,
  sourceBranch,
  sourceWorktreePath,
  onClose,
  onMergeOut,
}: MergeOutDialogProps) {
  const t = useT()
  const [plan, setPlan] = useState<RepositoryBranchMergeOutPlan | null>(null)
  const [selected, setSelected] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictWorktree, setConflictWorktree] = useState<{ branch: string; path: string } | null>(null)
  const planAbortRef = useRef<AbortController | null>(null)
  const { pending, isPending, run } = useAsyncPending<'merge' | 'pullMergePush'>()

  async function loadPlan(preserveError = false) {
    planAbortRef.current?.abort()
    const controller = new AbortController()
    planAbortRef.current = controller
    setLoading(true)
    setPlan(null)
    setSelected('')
    setBranchQuery('')
    if (!preserveError) setError(null)
    setConflictWorktree(null)
    try {
      const result = await getRepositoryBranchMergeOutPlan(
        { repoId, sourceBranch, sourceWorktreePath },
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPlan(result.plan)
      if (!result.plan.ready && result.plan.message) setError(result.plan.message)
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (planAbortRef.current === controller) {
        planAbortRef.current = null
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (open) void loadPlan()
    else {
      planAbortRef.current?.abort()
      planAbortRef.current = null
      setPlan(null)
      setSelected('')
      setBranchQuery('')
      setLoading(false)
      setError(null)
      setConflictWorktree(null)
    }
    return () => {
      planAbortRef.current?.abort()
      planAbortRef.current = null
    }
  }, [open, repoId, sourceBranch, sourceWorktreePath])

  const destination = plan?.destinations.find(
    (candidate) => repositoryMergeBranchSelectionKey(candidate.destination) === selected,
  )

  async function handleConfirm(mode: 'merge' | 'pullMergePush') {
    if (!plan || !destination?.ready) return
    setError(null)
    setConflictWorktree(null)
    await run(mode, async () => {
      try {
        const result = await onMergeOut({
          repoId: plan.repoId,
          planToken: plan.token,
          sourceBranch: plan.sourceBranch,
          sourceWorktreePath: plan.sourceWorktreePath,
          destination: destination.destination,
          mode: mode === 'merge' ? 'merge' : 'pull-merge-push',
        })
        if (!result.ok) {
          setError(result.message)
          setConflictWorktree(result.conflictWorktree ?? null)
          if (result.message === 'error.merge-out-plan-changed') await loadPlan(true)
          return
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) onClose()
      }}
      title={t('action.merge-out-title', { branch: sourceBranch })}
    >
      <form
        data-slot="merge-out-dialog-form"
        className="min-w-0 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void handleConfirm('merge')
        }}
      >
        <Field>
          <FieldLabel htmlFor="merge-out-source">{t('action.merge-out-source-label')}</FieldLabel>
          <Input id="merge-out-source" value={sourceBranch} readOnly />
        </Field>
        <Field data-slot="merge-out-dialog-branch-field" className="min-w-0">
          <FieldLabel htmlFor="merge-out-select">{t('action.merge-out-destination-label')}</FieldLabel>
          <Select value={selected} onValueChange={setSelected} disabled={loading || !plan}>
            <SelectTrigger id="merge-out-select" className="min-w-0 w-full">
              <SelectValue
                placeholder={loading ? t('action.merge-out-loading') : t('action.merge-out-destination-placeholder')}
              />
            </SelectTrigger>
            <SelectContent
              header={
                <RemoteBranchSearchInput
                  id="merge-out-branch-search"
                  value={branchQuery}
                  placeholder={t('branches.search-placeholder')}
                  ariaLabel={t('branches.search-label')}
                  disabled={loading || !plan}
                  onChange={setBranchQuery}
                />
              }
            >
              {plan?.destinations
                .filter((candidate) => mergeBranchMatchesQuery(candidate.destination, branchQuery))
                .map((candidate) => {
                  const key = repositoryMergeBranchSelectionKey(candidate.destination)
                  const name = repositoryMergeBranchDisplayName(candidate.destination)
                  const text = candidate.destination.kind === 'remote' ? `${name} (${t('tab.remote-branches')})` : name
                  return (
                    <SelectItem
                      key={key}
                      value={key}
                      textValue={text}
                      disabled={!candidate.ready}
                      data-merge-destination-key={key}
                      data-merge-destination-kind={candidate.destination.kind}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate">{text}</span>
                        {candidate.blockReason ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t(
                              candidate.blockReason === 'dirty-worktree'
                                ? 'action.merge-out-destination-dirty'
                                : 'action.merge-out-destination-unavailable',
                            )}
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  )
                })}
            </SelectContent>
          </Select>
          {destination?.destination.kind === 'remote' ? (
            <FieldDescription>{t('action.merge-out-remote-push-note')}</FieldDescription>
          ) : destination && !destination.pullMergePushReady ? (
            <FieldDescription>{t('action.merge-out-destination-upstream-required')}</FieldDescription>
          ) : null}
        </Field>
        {error && <MergeDialogError>{error.startsWith('error.merge-out') ? t(error) : error}</MergeDialogError>}
        {conflictWorktree && (
          <WorktreeMergeConflictAiActions
            repoId={repoId}
            branch={conflictWorktree.branch}
            worktreePath={conflictWorktree.path}
            onClose={onClose}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!destination?.ready || !destination.pullMergePushReady || isPending}
            onClick={() => void handleConfirm('pullMergePush')}
          >
            {pending === 'pullMergePush' && <Loader2 className="animate-spin" />}
            {t('action.merge-out-pull-merge-push-confirm')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!destination?.ready || destination.destination.kind === 'remote' || isPending}
          >
            {pending === 'merge' && <Loader2 className="animate-spin" />}
            {t('action.merge-out-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

function mergeBranchMatchesQuery(candidate: RepositoryMergeBranchSelection, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return !normalizedQuery || repositoryMergeBranchDisplayName(candidate).toLocaleLowerCase().includes(normalizedQuery)
}

function MergeDialogError({ children }: { children: string }) {
  return (
    <DialogError data-slot="merge-dialog-error" className="min-w-0 max-w-full overflow-hidden p-0">
      <ScrollArea
        data-slot="merge-dialog-error-scroll"
        className="max-h-40 w-full max-w-full min-w-0"
        viewportClassName="max-h-40"
      >
        <pre className="block w-full max-w-full min-w-0 whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]">
          {children}
        </pre>
      </ScrollArea>
    </DialogError>
  )
}

function WorktreeMergeConflictAiActions({
  repoId,
  branch,
  worktreePath,
  onClose,
}: {
  repoId: string
  branch: string
  worktreePath: string
  onClose: () => void
}) {
  const navigation = useMainWindowNavigation()
  const setDetailCollapsed = useReposStore((s) => s.setDetailCollapsed)
  const onHandoff = useCallback(
    async (provider: CommitMessageProvider) =>
      await prefillAiTerminalCommand({
        repoId,
        branch,
        worktreePath,
        navigation,
        setDetailCollapsed,
        command: buildMergeConflictAiCommand(provider),
      }),
    [branch, navigation, repoId, setDetailCollapsed, worktreePath],
  )

  return (
    <MergeConflictAiActions prompt={buildMergeConflictAiPrompt()} onHandoff={onHandoff} onHandoffComplete={onClose} />
  )
}

// ── Create branch dialog ─────────────────────────────────────────────────────

interface CreateBranchDialogProps {
  open: boolean
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  busy: boolean
  onClose: () => void
  onCreate: (branchName: string) => Promise<void>
}

export function CreateBranchDialog({ open, branch, allBranches, busy, onClose, onCreate }: CreateBranchDialogProps) {
  const t = useT()
  const [branchName, setBranchName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'createBranch'>()
  const pending = busy || isPending
  const validationKey = branchNameValidationKey(branchName, allBranches)

  useEffect(() => {
    if (!open) {
      setBranchName('')
      setError(null)
    }
  }, [open])

  async function handleConfirm() {
    if (validationKey || pending) return
    setError(null)
    await run('createBranch', async () => {
      try {
        await onCreate(branchName.trim())
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) onClose()
      }}
      title={t('action.create-branch-title')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="create-branch-base">{t('action.create-branch-base-label')}</FieldLabel>
          <Input id="create-branch-base" value={branch.name} readOnly className="font-mono text-xs" />
        </Field>
        <Field data-invalid={validationKey ? true : undefined}>
          <FieldLabel htmlFor="create-branch-name">{t('action.create-branch-name-label')}</FieldLabel>
          <Input
            id="create-branch-name"
            autoFocus
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder={t('action.create-worktree-branch-placeholder')}
            aria-invalid={!!validationKey}
          />
          <FieldError reserveHeight aria-live="polite" aria-atomic="true">
            {validationKey ? t(validationKey) : ''}
          </FieldError>
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!!validationKey || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t('action.create-branch-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

// ── Pull remote branch dialog ────────────────────────────────────────────────

interface PullRemoteBranchDialogProps {
  open: boolean
  repoId: string
  allBranches: RepoBranchState[]
  busy: boolean
  onClose: () => void
  onTrack: (input: { localBranch: string; remoteRef: string }) => Promise<void>
}

export function PullRemoteBranchDialog({
  open,
  repoId,
  allBranches,
  busy,
  onClose,
  onTrack,
}: PullRemoteBranchDialogProps) {
  const t = useT()
  const [remoteRefs, setRemoteRefs] = useState<string[]>([])
  const [remoteRef, setRemoteRef] = useState('')
  const [remoteRefQuery, setRemoteRefQuery] = useState('')
  const [localBranch, setLocalBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'trackRemoteBranch'>()
  const choices = remoteTrackingBranchChoices(remoteRefs, allBranches)
  const visibleChoices = choices.filter((choice) => remoteRefMatchesQuery(choice.remoteRef, remoteRefQuery))
  const visibleSelected = visibleChoices.find((choice) => choice.remoteRef === remoteRef)
  const activeChoice = visibleSelected ?? visibleChoices[0]
  const effectiveRemoteRef = activeChoice?.remoteRef ?? ''
  const effectiveLocalBranch = localBranch.trim() || activeChoice?.defaultLocalBranch || ''
  const validationKey = branchNameValidationKey(effectiveLocalBranch, allBranches)
  const pending = busy || isPending

  useEffect(() => {
    if (!open) {
      setRemoteRefs([])
      setRemoteRef('')
      setRemoteRefQuery('')
      setLocalBranch('')
      setLoading(false)
      setLoadFailed(false)
      setError(null)
      return
    }

    const ctrl = new AbortController()
    setLoading(true)
    setLoadFailed(false)
    void getRepositoryRemoteBranches(repoId, ctrl.signal)
      .then((refs) => {
        if (!ctrl.signal.aborted) setRemoteRefs(refs)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setRemoteRefs([])
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [open, repoId])

  useEffect(() => {
    if (!open) return
    const firstChoice = choices[0]
    if (!firstChoice) {
      if (remoteRef) setRemoteRef('')
      if (localBranch) setLocalBranch('')
      return
    }
    const selectedChoice = choices.find((choice) => choice.remoteRef === remoteRef)
    if (!selectedChoice) {
      setRemoteRef(firstChoice.remoteRef)
      setLocalBranch(firstChoice.defaultLocalBranch)
      return
    }
    if (!localBranch.trim()) setLocalBranch(selectedChoice.defaultLocalBranch)
  }, [choices, localBranch, open, remoteRef])

  useEffect(() => {
    if (!open || !remoteRef || visibleSelected || !activeChoice) return
    setLocalBranch(activeChoice.defaultLocalBranch)
  }, [activeChoice?.defaultLocalBranch, activeChoice?.remoteRef, open, remoteRef, visibleSelected])

  async function handleConfirm() {
    if (!effectiveRemoteRef || validationKey || pending) return
    setError(null)
    await run('trackRemoteBranch', async () => {
      try {
        await onTrack({ localBranch: effectiveLocalBranch, remoteRef: effectiveRemoteRef })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) onClose()
      }}
      title={t('action.pull-remote-branch-title')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="pull-remote-ref">{t('action.pull-remote-branch-remote-label')}</FieldLabel>
          <Select
            value={remoteRef}
            onValueChange={(next) => {
              const nextChoice = choices.find((choice) => choice.remoteRef === next)
              setRemoteRef(next)
              setLocalBranch(nextChoice?.defaultLocalBranch ?? '')
            }}
            disabled={choices.length === 0 || loading}
          >
            <SelectTrigger
              id="pull-remote-ref"
              className="w-full"
              aria-label={t('action.pull-remote-branch-remote-label')}
            >
              <SelectValue placeholder={t('action.create-worktree-remote-placeholder')} />
            </SelectTrigger>
            <SelectContent
              matchTriggerWidth
              header={
                <RemoteBranchSearchInput
                  id="pull-remote-ref-filter"
                  value={remoteRefQuery}
                  onChange={setRemoteRefQuery}
                  placeholder={t('action.remote-branch-search-placeholder')}
                  ariaLabel={t('action.remote-branch-search-label')}
                  disabled={choices.length === 0 || loading}
                />
              }
            >
              {visibleChoices.map((choice) => (
                <SelectItem key={choice.remoteRef} value={choice.remoteRef} textValue={choice.remoteRef}>
                  <span className="truncate">{choice.remoteRef}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription reserveHeight aria-live="polite" aria-atomic="true">
            {loading
              ? t('action.create-worktree-remote-loading')
              : loadFailed
                ? t('action.pull-remote-branch-load-failed')
                : choices.length === 0 || visibleChoices.length === 0
                  ? t('action.create-worktree-remote-empty')
                  : ''}
          </FieldDescription>
        </Field>
        <Field data-invalid={validationKey ? true : undefined}>
          <FieldLabel htmlFor="pull-remote-local-branch">{t('action.create-worktree-local-branch-label')}</FieldLabel>
          <Input
            id="pull-remote-local-branch"
            value={localBranch}
            onChange={(e) => setLocalBranch(e.target.value)}
            placeholder={activeChoice?.defaultLocalBranch || t('action.create-worktree-local-branch-placeholder')}
            aria-invalid={!!validationKey}
          />
          <FieldError reserveHeight aria-live="polite" aria-atomic="true">
            {validationKey ? t(validationKey) : ''}
          </FieldError>
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!effectiveRemoteRef || !!validationKey || pending || loading}>
            {pending && <Loader2 className="animate-spin" />}
            {t('action.pull-remote-branch-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
