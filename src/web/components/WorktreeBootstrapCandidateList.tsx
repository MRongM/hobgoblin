import {
  MaterializationCandidateList,
  type MaterializationCandidateChoice,
} from '#/web/components/MaterializationCandidateList.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { WorktreeBootstrapCandidate } from '#/shared/worktree-bootstrap-summary.ts'

export type WorktreeBootstrapCandidateChoice = MaterializationCandidateChoice

interface WorktreeBootstrapCandidateListProps {
  candidates: readonly WorktreeBootstrapCandidate[]
  choices: Readonly<Record<string, WorktreeBootstrapCandidateChoice | undefined>>
  onChoiceChange: (path: string, choice: WorktreeBootstrapCandidateChoice) => void
  headingId?: string
  label?: string
  description?: string
  disabled?: boolean
}

export function WorktreeBootstrapCandidateList({
  candidates,
  choices,
  onChoiceChange,
  headingId = 'worktree-bootstrap-candidates-label',
  label,
  description,
  disabled = false,
}: WorktreeBootstrapCandidateListProps) {
  const t = useT()

  return (
    <MaterializationCandidateList
      items={candidates.map((candidate) => ({
        id: candidate.path,
        label: candidate.path,
        kind: candidate.kind,
      }))}
      choices={choices}
      onChoiceChange={onChoiceChange}
      headingId={headingId}
      label={label ?? t('action.create-worktree-bootstrap-candidates-label')}
      description={description ?? t('action.create-worktree-bootstrap-candidates-description')}
      disabled={disabled}
    />
  )
}
