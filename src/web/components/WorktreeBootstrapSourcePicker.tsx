import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import { useT } from '#/web/stores/i18n.ts'

interface WorktreeBootstrapSourcePickerProps {
  source: RepositoryDependencySource
  options: readonly RepositoryDependencySource[]
  pending?: boolean
  onSourceChange: (source: RepositoryDependencySource) => void
}

export function WorktreeBootstrapSourcePicker({
  source,
  options,
  pending = false,
  onSourceChange,
}: WorktreeBootstrapSourcePickerProps) {
  const t = useT()
  const alternatives = options.filter((candidate) => candidate.id !== source.id)

  return (
    <div className="mb-2 grid gap-1.5 rounded-md border border-separator bg-muted/20 p-2">
      <p className="text-xs text-muted-foreground">
        {source.kind === 'primary'
          ? t('worktree-bootstrap.source-primary')
          : t('worktree-bootstrap.source-branch', { branch: source.branch })}
      </p>
      {alternatives.length > 0 ? (
        <select
          aria-label={t('worktree-bootstrap.source-select')}
          value=""
          disabled={pending}
          data-worktree-bootstrap-source-select
          className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs"
          onChange={(event) => {
            const nextSource = alternatives.find((candidate) => candidate.id === event.target.value)
            if (nextSource) onSourceChange(nextSource)
          }}
        >
          <option value="">{t('worktree-bootstrap.source-select')}</option>
          {alternatives.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.kind === 'primary' ? t('worktree-bootstrap.source-primary-option') : candidate.branch}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
