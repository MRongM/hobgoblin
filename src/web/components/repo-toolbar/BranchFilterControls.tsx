import { useStoreWithEqualityFn } from 'zustand/traditional'
import { BranchViewModeControl } from '#/web/components/repo-toolbar/BranchViewModeControl.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { BranchViewMode } from '#/web/stores/repos/types.ts'
import { cn } from '#/web/lib/cn.ts'

interface Props {
  repoId: string
  className?: string
}

export function BranchFilterControls({ repoId, className }: Props) {
  const { branchCount, branchViewMode } = useStoreWithEqualityFn(
    useReposStore,
    (s) => ({
      branchCount: s.repos[repoId]?.data.branches.length ?? 0,
      branchViewMode: s.repos[repoId]?.ui.branchViewMode ?? 'all',
    }),
    (a, b) => a.branchCount === b.branchCount && a.branchViewMode === b.branchViewMode,
  )
  const setBranchViewMode = useReposStore((s) => s.setBranchViewMode)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BranchViewModeControl
        value={branchViewMode as BranchViewMode}
        disabled={branchCount === 0}
        onChange={(viewMode) => setBranchViewMode(repoId, viewMode)}
      />
    </div>
  )
}
