import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ExecResult } from '#/shared/git-types.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldDescription, FieldError, FieldLabel } from '#/web/components/ui/field.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
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

interface MergeDialogProps {
  open: boolean
  repoId: string
  worktreePath: string
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  onClose: () => void
  onMerge: (sourceBranch: string) => Promise<ExecResult>
}

export function MergeDialog({ open, repoId, worktreePath, branch, allBranches, onClose, onMerge }: MergeDialogProps) {
  const t = useT()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorReason, setErrorReason] = useState<ExecResult['reason'] | null>(null)
  const { isPending, run } = useAsyncPending<'merge'>()

  const candidates = allBranches.filter((b) => b.name !== branch.name)

  useEffect(() => {
    if (!open) {
      setSelected('')
      setError(null)
      setErrorReason(null)
    }
  }, [open])

  async function handleConfirm() {
    if (!selected) return
    setError(null)
    setErrorReason(null)
    await run('merge', async () => {
      try {
        const result = await onMerge(selected)
        if (!result.ok) {
          setError(result.message)
          setErrorReason(result.reason ?? null)
          return
        }
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
      title={t('action.merge-title')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
        className="space-y-4"
      >
        <Field>
          <FieldLabel htmlFor="merge-select">{t('action.merge-label')}</FieldLabel>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="merge-select" className="w-full">
              <SelectValue placeholder={t('action.merge-placeholder')} />
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
        {error && <MergeDialogError>{error}</MergeDialogError>}
        {errorReason === 'merge-conflict' && (
          <MergeConflictAiActions repoId={repoId} branch={branch.name} worktreePath={worktreePath} />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!selected || isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('action.merge-confirm')}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

function MergeDialogError({ children }: { children: string }) {
  return (
    <DialogError data-slot="merge-dialog-error" className="overflow-hidden p-0">
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

function MergeConflictAiActions({
  repoId,
  branch,
  worktreePath,
}: {
  repoId: string
  branch: string
  worktreePath: string
}) {
  const t = useT()
  const navigation = useMainWindowNavigation()
  const setDetailCollapsed = useReposStore((s) => s.setDetailCollapsed)
  const mergeConflictAi = useMergeConflictAiActions({
    repoId,
    branch,
    worktreePath,
    navigation,
    setDetailCollapsed,
  })
  if (mergeConflictAi.actions.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-muted/35 p-2">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{t('action.merge-conflict-ai-title')}</div>
      <div className="flex flex-wrap gap-2">
        {mergeConflictAi.actions.map((action) => (
          <Button
            key={action.provider}
            type="button"
            variant="outline"
            size="sm"
            title={action.title}
            disabled={action.disabled}
            onClick={() => void action.onSelect()}
          >
            {action.pending && <Loader2 className="animate-spin" />}
            {action.label}
          </Button>
        ))}
      </div>
      {mergeConflictAi.error && <p className="mt-2 text-xs text-destructive">{mergeConflictAi.error}</p>}
    </div>
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

export function CreateBranchDialog({
  open,
  branch,
  allBranches,
  busy,
  onClose,
  onCreate,
}: CreateBranchDialogProps) {
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
  const selected = visibleChoices.find((choice) => choice.remoteRef === remoteRef) ?? visibleChoices[0]
  const effectiveRemoteRef = selected?.remoteRef ?? ''
  const effectiveLocalBranch = localBranch.trim() || selected?.defaultLocalBranch || ''
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
    if (!selected) {
      if (remoteRef) setRemoteRef('')
      if (localBranch) setLocalBranch('')
      return
    }
    if (remoteRef !== selected.remoteRef) {
      setRemoteRef(selected.remoteRef)
      setLocalBranch(selected.defaultLocalBranch)
      return
    }
    if (!localBranch.trim()) setLocalBranch(selected.defaultLocalBranch)
  }, [localBranch, open, remoteRef, selected])

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
            value={effectiveRemoteRef}
            onValueChange={(next) => {
              const nextChoice = choices.find((choice) => choice.remoteRef === next)
              setRemoteRef(next)
              setLocalBranch(nextChoice?.defaultLocalBranch ?? '')
            }}
            disabled={visibleChoices.length === 0 || loading}
          >
            <SelectTrigger id="pull-remote-ref" className="w-full" aria-label={t('action.pull-remote-branch-remote-label')}>
              <SelectValue placeholder={t('action.create-worktree-remote-placeholder')} />
            </SelectTrigger>
            <SelectContent
              header={
                <Input
                  id="pull-remote-ref-filter"
                  autoFocus
                  value={remoteRefQuery}
                  onChange={(e) => setRemoteRefQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={t('action.remote-branch-search-placeholder')}
                  aria-label={t('action.remote-branch-search-label')}
                  disabled={choices.length === 0 || loading}
                  className="h-8"
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
            placeholder={selected?.defaultLocalBranch || t('action.create-worktree-local-branch-placeholder')}
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
