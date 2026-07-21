import { File, Folder } from 'lucide-react'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { ToggleGroup, ToggleGroupItem } from '#/web/components/ui/toggle-group.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { WorktreeBootstrapCandidate, WorktreeBootstrapSelectionMode } from '#/shared/worktree-bootstrap-summary.ts'

export type WorktreeBootstrapCandidateChoice = 'skip' | WorktreeBootstrapSelectionMode

interface WorktreeBootstrapCandidateListProps {
  candidates: readonly WorktreeBootstrapCandidate[]
  choices: Readonly<Record<string, WorktreeBootstrapCandidateChoice | undefined>>
  onChoiceChange: (path: string, choice: WorktreeBootstrapCandidateChoice) => void
  headingId?: string
  label?: string
  description?: string
}

const CHOICES = [
  { value: 'skip', labelKey: 'action.create-worktree-bootstrap-candidate-skip' },
  { value: 'copy', labelKey: 'action.create-worktree-bootstrap-candidate-copy' },
  { value: 'symlink', labelKey: 'action.create-worktree-bootstrap-candidate-symlink' },
] satisfies Array<{ value: WorktreeBootstrapCandidateChoice; labelKey: string }>

export function WorktreeBootstrapCandidateList({
  candidates,
  choices,
  onChoiceChange,
  headingId = 'worktree-bootstrap-candidates-label',
  label,
  description,
}: WorktreeBootstrapCandidateListProps) {
  const t = useT()

  return (
    <section className="rounded-md border border-border/80 bg-muted/20" aria-labelledby={headingId}>
      <div className="space-y-0.5 border-b border-border/70 px-3 py-2">
        <h3 id={headingId} className="text-xs font-medium text-foreground">
          {label ?? t('action.create-worktree-bootstrap-candidates-label')}
        </h3>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {description ?? t('action.create-worktree-bootstrap-candidates-description')}
        </p>
      </div>
      <ScrollArea className="max-h-44" scrollbarMode="compact">
        <div className="divide-y divide-border/60 p-1">
          {candidates.map((candidate) => {
            const Icon = candidate.kind === 'directory' ? Folder : File
            const choice = choices[candidate.path] ?? 'skip'
            return (
              <div
                key={candidate.path}
                data-bootstrap-candidate-path={candidate.path}
                className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5"
              >
                <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={candidate.path}>
                  {candidate.path}
                </span>
                <ToggleGroup
                  type="single"
                  value={choice}
                  onValueChange={(next) => {
                    if (next) onChoiceChange(candidate.path, next as WorktreeBootstrapCandidateChoice)
                  }}
                  variant="outline"
                  size="sm"
                  aria-label={candidate.path}
                  className="shrink-0"
                >
                  {CHOICES.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      data-bootstrap-candidate-choice={option.value}
                      aria-label={`${candidate.path}: ${t(option.labelKey)}`}
                      className="h-7 px-2 text-[11px]"
                    >
                      {t(option.labelKey)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </section>
  )
}
