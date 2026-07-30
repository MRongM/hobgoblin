import { Loader2 } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'
import { useT } from '#/web/stores/i18n.ts'

interface MergeConflictAiActionsProps {
  onHandoff: (provider: CommitMessageProvider) => Promise<boolean>
  onHandoffComplete: () => void
}

export function MergeConflictAiActions({ onHandoff, onHandoffComplete }: MergeConflictAiActionsProps) {
  const t = useT()
  const mergeConflictAi = useMergeConflictAiActions({ onHandoff })
  if (mergeConflictAi.actions.length === 0) return null

  return (
    <div
      data-slot="merge-conflict-ai-actions"
      className="min-w-0 max-w-full rounded-[var(--goblin-brand-radius-md,var(--radius-md))] border border-app-region-border bg-app-region p-2"
    >
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
      {mergeConflictAi.error && <p className="mt-2 text-xs text-destructive">{mergeConflictAi.error}</p>}
    </div>
  )
}
