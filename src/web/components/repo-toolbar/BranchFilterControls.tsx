import { useStoreWithEqualityFn } from 'zustand/traditional'
import { BranchSearchInput } from '#/web/components/repo-toolbar/BranchSearchInput.tsx'
import { BranchViewModeControl } from '#/web/components/repo-toolbar/BranchViewModeControl.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { BranchViewMode } from '#/web/stores/repos/types.ts'
import { cn } from '#/web/lib/cn.ts'

interface Props {
  repoId: string
  className?: string
  searchClassName?: string
}

export function BranchFilterControls({ repoId, className, searchClassName }: Props) {
  const { branchCount, branchViewMode, branchSearchQuery } = useStoreWithEqualityFn(
    useReposStore,
    (s) => ({
      branchCount: s.repos[repoId]?.data.branches.length ?? 0,
      branchViewMode: s.repos[repoId]?.ui.branchViewMode ?? 'all',
      branchSearchQuery: s.branchSearchQueries[repoId] ?? '',
    }),
    (a, b) =>
      a.branchCount === b.branchCount &&
      a.branchViewMode === b.branchViewMode &&
      a.branchSearchQuery === b.branchSearchQuery,
  )
  const setBranchViewMode = useReposStore((s) => s.setBranchViewMode)
  const setBranchSearchQuery = useReposStore((s) => s.setBranchSearchQuery)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BranchViewModeControl
        value={branchViewMode as BranchViewMode}
        disabled={branchCount === 0}
        onChange={(viewMode) => setBranchViewMode(repoId, viewMode)}
      />
      <BranchSearchInput
        value={branchSearchQuery}
        disabled={branchCount === 0}
        className={searchClassName}
        onChange={(query) => setBranchSearchQuery(repoId, query)}
      />
    </div>
  )
}
