import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import { WorktreeBootstrapSourcePicker } from '#/web/components/WorktreeBootstrapSourcePicker.tsx'
import { WorktreeDependencyTree } from '#/web/components/WorktreeDependencyTree.tsx'
import type { RepositoryDependencySource } from '#/web/components/repo-workspace/branch-workspace-repository-dependency-source.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface BranchWorkspaceRepositoryDependencySelectionProps {
  repoId: string
  source: RepositoryDependencySource
  sourceOptions: readonly RepositoryDependencySource[]
  selections: readonly WorktreeBootstrapSelection[]
  disabled?: boolean
  onSourceChange: (source: RepositoryDependencySource) => void
  onSelectionsChange: (selections: WorktreeBootstrapSelection[]) => void
  onPendingChange?: (pending: boolean) => void
}

export function BranchWorkspaceRepositoryDependencySelection({
  repoId,
  source,
  sourceOptions,
  selections,
  disabled = false,
  onSourceChange,
  onSelectionsChange,
  onPendingChange,
}: BranchWorkspaceRepositoryDependencySelectionProps) {
  const t = useT()
  const treeId = useId()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => setCollapsed(false), [source.id])
  useEffect(() => {
    if (selections.length === 0) setCollapsed(false)
  }, [selections.length])

  const toggleKey = collapsed
    ? 'workspace.branch-workspace.repository-dependencies-expand'
    : 'workspace.branch-workspace.repository-dependencies-collapse'

  return (
    <div data-branch-workspace-repository-dependency-selection={repoId} className="grid gap-2">
      <WorktreeBootstrapSourcePicker
        source={source}
        options={sourceOptions}
        pending={disabled}
        onSourceChange={(nextSource) => {
          setCollapsed(false)
          onSourceChange(nextSource)
        }}
      />
      {selections.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-action={collapsed ? 'expand-repository-dependencies' : 'collapse-repository-dependencies'}
            aria-expanded={!collapsed}
            aria-controls={treeId}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {t(toggleKey)}
          </Button>
        </div>
      ) : null}
      {collapsed ? (
        <ul
          data-branch-workspace-repository-dependency-summary
          aria-label={t('workspace.branch-workspace.repository-dependencies')}
          className="grid gap-1 rounded-md border border-separator bg-muted/20 p-2"
        >
          {selections.map((selection) => (
            <li
              key={selection.path}
              data-repository-dependency-summary={selection.path}
              className="flex min-w-0 items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate font-mono" title={selection.path}>
                {selection.path}
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t(`worktree-dependency-tree.${selection.mode}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div id={treeId} hidden={collapsed} data-branch-workspace-repository-dependency-tree>
        <WorktreeDependencyTree
          repoId={repoId}
          sourceWorktreePath={source.worktreePath}
          selections={selections}
          disabled={disabled}
          onSelectionsChange={onSelectionsChange}
          onPendingChange={onPendingChange}
        />
      </div>
    </div>
  )
}
