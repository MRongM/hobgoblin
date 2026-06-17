import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useCommitMessageGeneration } from '#/web/components/branch-list/useCommitMessageGeneration.ts'

interface InlineCommitFormProps {
  repoId: string
  worktreePath: string
  onClose: () => void
  onCommit: (message: string) => Promise<void>
}

export function InlineCommitForm({ repoId, worktreePath, onClose, onCommit }: InlineCommitFormProps) {
  const t = useT()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { isPending, run } = useAsyncPending<'commit'>()
  const generation = useCommitMessageGeneration({
    repoId,
    worktreePath,
    message,
    setMessage,
    setError,
    formatError: (value) => formatCommitMessageGenerationError(t, value),
  })

  async function handleConfirm() {
    const trimmed = message.trim()
    if (!trimmed) return
    setError(null)
    await run('commit', async () => {
      try {
        await onCommit(trimmed)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="col-span-full border-t border-border/70 bg-muted/35 px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
            {generation.availableProviders.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {generation.availableProviders.map((provider) => (
                  <CommitGenerateButton
                    key={provider}
                    provider={provider}
                    generating={generation.generating}
                    disabled={isPending}
                    onGenerate={generation.generate}
                  />
                ))}
              </div>
            )}
          </div>
          <textarea
            id="inline-commit-message"
            className="w-full min-h-[64px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={t('action.commit-message-placeholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isPending}
          />
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!message.trim() || isPending || generation.generating !== null}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('action.commit-confirm')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={generation.pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={() => generation.setPendingGeneratedMessage(null)}
        onConfirm={generation.applyPendingGeneratedMessage}
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

function formatCommitMessageGenerationError(t: (key: string) => string, message: string): string {
  if (message === 'cancelled') return ''
  return message.startsWith('error.') ? t(message) : message
}
