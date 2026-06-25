import { Loader2, Sparkles } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'

interface InlineCommitFormProps {
  message: string
  error: string | null
  availableProviders: CommitMessageProvider[]
  generating: CommitMessageProvider | null
  pendingGeneratedMessage: string | null
  onMessageChange: (message: string) => void
  onErrorChange: (message: string | null) => void
  onGenerate: (provider: CommitMessageProvider) => Promise<void>
  onApplyPendingGeneratedMessage: () => void
  onClearPendingGeneratedMessage: () => void
  onClose: () => void
  onCommit: (message: string) => Promise<void>
  onCommitAndPush?: (message: string) => Promise<void>
}

export function InlineCommitForm({
  message,
  error,
  availableProviders,
  generating,
  pendingGeneratedMessage,
  onMessageChange,
  onErrorChange,
  onGenerate,
  onApplyPendingGeneratedMessage,
  onClearPendingGeneratedMessage,
  onClose,
  onCommit,
  onCommitAndPush,
}: InlineCommitFormProps) {
  const t = useT()
  const { pending, isPending, run } = useAsyncPending<'commit' | 'commitAndPush'>()

  async function handleSubmit(action: 'commit' | 'commitAndPush', submit: (message: string) => Promise<void>) {
    const trimmed = message.trim()
    if (!trimmed) return
    onErrorChange(null)
    await run(action, async () => {
      try {
        await submit(trimmed)
        onClose()
      } catch (err) {
        onErrorChange(err instanceof Error ? err.message : String(err))
      }
    })
  }

  async function handleConfirm() {
    await handleSubmit('commit', onCommit)
  }

  async function handleCommitAndPush() {
    if (!onCommitAndPush) return
    await handleSubmit('commitAndPush', onCommitAndPush)
  }

  const submitDisabled = !message.trim() || isPending || generating !== null

  return (
    <div
      className="col-span-full border-t border-app-region-border bg-app-region px-4 py-3"
      onClick={(e) => e.stopPropagation()}
    >
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
      >
        <Field>
          <div className="flex min-h-7 items-center justify-between gap-3">
            <FieldLabel htmlFor="inline-commit-message">{t('action.commit-message-label')}</FieldLabel>
            {availableProviders.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {availableProviders.map((provider) => (
                  <CommitGenerateButton
                    key={provider}
                    provider={provider}
                    generating={generating}
                    disabled={isPending}
                    onGenerate={onGenerate}
                  />
                ))}
              </div>
            )}
          </div>
          <textarea
            id="inline-commit-message"
            className="min-h-[64px] w-full resize-y rounded-[var(--goblin-control-radius,var(--radius-md))] border border-input-border bg-input-background px-3 py-2 text-sm text-input-foreground placeholder:text-input-placeholder focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('action.commit-message-placeholder')}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            disabled={isPending}
          />
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={submitDisabled}>
            {pending === 'commit' && <Loader2 className="animate-spin" />}
            {t('action.commit-confirm')}
          </Button>
          {onCommitAndPush && (
            <Button type="button" size="sm" disabled={submitDisabled} onClick={() => void handleCommitAndPush()}>
              {pending === 'commitAndPush' && <Loader2 className="animate-spin" />}
              {t('action.commit-and-push-confirm')}
            </Button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={onClearPendingGeneratedMessage}
        onConfirm={onApplyPendingGeneratedMessage}
      />
    </div>
  )
}

function CommitGenerateButton({
  provider,
  generating,
  disabled,
  onGenerate,
}: {
  provider: CommitMessageProvider
  generating: CommitMessageProvider | null
  disabled: boolean
  onGenerate: (provider: CommitMessageProvider) => Promise<void>
}) {
  const t = useT()
  const isGeneratingProvider = generating === provider
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      data-provider={provider}
      disabled={disabled || generating !== null}
      aria-busy={isGeneratingProvider ? true : undefined}
      title={t(`action.commit-generate-${provider}`)}
      onClick={() => void onGenerate(provider)}
    >
      {isGeneratingProvider ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {isGeneratingProvider ? t('action.commit-generate-loading') : t(`action.commit-generate-${provider}`)}
    </Button>
  )
}
