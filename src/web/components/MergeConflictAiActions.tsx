import { Loader2 } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { CopyButton } from '#/web/components/CopyButton.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'
import { useT } from '#/web/stores/i18n.ts'

interface MergeConflictAiActionsProps {
  onHandoff: (provider: CommitMessageProvider) => Promise<boolean>
  onHandoffComplete: () => void
  prompt?: string
  title?: string
}

export function MergeConflictAiActions({ onHandoff, onHandoffComplete, prompt, title }: MergeConflictAiActionsProps) {
  const t = useT()
  const mergeConflictAi = useMergeConflictAiActions({ onHandoff })
  if (mergeConflictAi.actions.length === 0 && !prompt) return null

  return (
    <div
      data-slot="merge-conflict-ai-actions"
      className="min-w-0 max-w-full rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border border-app-region-border bg-app-region p-2"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{title ?? t('action.merge-conflict-ai-title')}</span>
        {prompt ? (
          <CopyButton
            value={prompt}
            copyLabel={t('action.merge-conflict-ai-copy-prompt')}
            copiedLabel={t('action.merge-conflict-ai-prompt-copied')}
          />
        ) : null}
      </div>
      {mergeConflictAi.actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {mergeConflictAi.actions.map((action) => (
            <Button
              key={action.provider}
              type="button"
              variant="outline"
              size="sm"
              title={action.title}
              disabled={action.disabled}
              onClick={() => {
                void action.onSelect().then((ok) => {
                  if (ok) onHandoffComplete()
                })
              }}
            >
              {action.pending && <Loader2 className="animate-spin" />}
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      {mergeConflictAi.error && <p className="mt-2 text-xs text-destructive">{mergeConflictAi.error}</p>}
    </div>
  )
}
