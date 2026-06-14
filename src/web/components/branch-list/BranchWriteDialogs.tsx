import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { COMMIT_MESSAGE_PROVIDERS, type CommitMessageProvider, type CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { DialogFooter } from '#/web/components/ui/dialog.tsx'
import { FormDialog } from '#/web/components/ui/form-dialog.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

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
  branch: RepoBranchState
  allBranches: RepoBranchState[]
  onClose: () => void
  onMerge: (sourceBranch: string) => Promise<void>
}

export function MergeDialog({ open, branch, allBranches, onClose, onMerge }: MergeDialogProps) {
  const t = useT()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'merge'>()

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
    await run('merge', async () => {
      try {
        await onMerge(selected)
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
        {error && <DialogError>{error}</DialogError>}
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

// ── Commit dialog ─────────────────────────────────────────────────────────────

interface CommitDialogProps {
  open: boolean
  repoId: string
  worktreePath: string
  onClose: () => void
  onCommit: (message: string) => Promise<void>
}

const EMPTY_COMMIT_MESSAGE_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export function CommitDialog({ open, repoId, worktreePath, onClose, onCommit }: CommitDialogProps) {
  const t = useT()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_COMMIT_MESSAGE_PROVIDERS)
  const [generating, setGenerating] = useState<CommitMessageProvider | null>(null)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'commit'>()
  const generationAbortRef = useRef<AbortController | null>(null)
  const messageRef = useRef(message)

  useEffect(() => {
    messageRef.current = message
  }, [message])

  useEffect(() => {
    if (!open) {
      generationAbortRef.current?.abort()
      generationAbortRef.current = null
      setMessage('')
      setError(null)
      setProviders(EMPTY_COMMIT_MESSAGE_PROVIDERS)
      setGenerating(null)
      setPendingGeneratedMessage(null)
      return
    }

    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then((nextProviders) => {
        if (!controller.signal.aborted) setProviders(nextProviders)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(EMPTY_COMMIT_MESSAGE_PROVIDERS)
      })
    return () => controller.abort()
  }, [open])

  async function handleConfirm() {
    if (!message.trim()) return
    setError(null)
    await run('commit', async () => {
      try {
        await onCommit(message.trim())
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  async function handleGenerate(provider: CommitMessageProvider) {
    if (!repoId || !worktreePath || generating) return
    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setGenerating(provider)
    setError(null)
    setPendingGeneratedMessage(null)
    try {
      const result = await generateRepositoryCommitMessage(repoId, worktreePath, provider, controller.signal)
      if (controller.signal.aborted) return
      if (!result.ok) {
        const nextError = formatCommitMessageGenerationError(t, result.message)
        if (nextError) setError(nextError)
        return
      }
      if (messageRef.current.trim()) {
        setPendingGeneratedMessage(result.message)
      } else {
        setMessage(result.message)
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(formatCommitMessageGenerationError(t, err instanceof Error ? err.message : String(err)))
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
        setGenerating(null)
      }
    }
  }

  function applyPendingGeneratedMessage() {
    if (!pendingGeneratedMessage) return
    setMessage(pendingGeneratedMessage)
    setPendingGeneratedMessage(null)
    setError(null)
  }

  const availableProviders = COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider])

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !isPending) onClose()
        }}
        title={t('action.commit-title')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleConfirm()
          }}
          className="space-y-4"
        >
          <Field>
            <div className="flex min-h-7 items-center justify-between gap-3">
              <FieldLabel htmlFor="commit-message">{t('action.commit-message-label')}</FieldLabel>
              {availableProviders.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {availableProviders.map((provider) => {
                    const isGeneratingProvider = generating === provider
                    return (
                      <Button
                        key={provider}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        data-provider={provider}
                        disabled={isPending || generating !== null}
                        aria-busy={isGeneratingProvider ? true : undefined}
                        title={t(`action.commit-generate-${provider}`)}
                        onClick={() => void handleGenerate(provider)}
                      >
                        {isGeneratingProvider ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        {isGeneratingProvider ? t('action.commit-generate-loading') : t(`action.commit-generate-${provider}`)}
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>
            <textarea
              id="commit-message"
              className="w-full min-h-[80px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={t('action.commit-message-placeholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isPending}
            />
          </Field>
          {error && <DialogError>{error}</DialogError>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!message.trim() || isPending || generating !== null}>
              {isPending && <Loader2 className="animate-spin" />}
              {t('action.commit-confirm')}
            </Button>
          </DialogFooter>
        </form>
      </FormDialog>
      <ConfirmDialog
        open={pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={() => setPendingGeneratedMessage(null)}
        onConfirm={applyPendingGeneratedMessage}
      />
    </>
  )
}

function formatCommitMessageGenerationError(t: (key: string) => string, message: string): string {
  if (message === 'cancelled') return ''
  return message.startsWith('error.') ? t(message) : message
}
