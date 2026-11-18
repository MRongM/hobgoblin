import { useCallback, useEffect } from 'react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { branchWorkspaceMemberRepositoryId } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import { shouldHeuristicallyRefreshRepoStatus } from '#/web/hooks/useHeuristicRepoStatusRefresh.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { ReposStore } from '#/web/stores/repos/types.ts'

function memberRepositoryIds(
  state: Pick<ReposStore, 'repos' | 'workspaceProjects'>,
  workspace: BranchWorkspaceSnapshot,
): string[] {
  const project = state.workspaceProjects[workspace.rootId]
  const ids = workspace.repositories.flatMap((member) => {
    if (member.progress === 'removed') return []
    const id = branchWorkspaceMemberRepositoryId(member, project?.repositoryIds ?? [], project?.candidates ?? [])
    const repo = id ? state.repos[id] : undefined
    return id && repo?.isGitRepo && repo.availability.phase === 'available' ? [id] : []
  })
  return [...new Set(ids)]
}

export function useBranchWorkspaceStatusRefresh(workspace: BranchWorkspaceSnapshot, selectionKey = ''): void {
  const memberInstancesKey = useReposStore((state) =>
    memberRepositoryIds(state, workspace)
      .map((id) => `${id}\0${state.repos[id]!.instanceToken}`)
      .join('\0'),
  )
  const refreshExpiredMembers = useCallback(() => {
    const state = useReposStore.getState()
    void Promise.allSettled(
      memberRepositoryIds(state, workspace).map(async (id) => {
        const repo = useReposStore.getState().repos[id]
        if (!repo || !repo.isGitRepo || repo.availability.phase !== 'available') return
        if (
          !shouldHeuristicallyRefreshRepoStatus({
            availability: repo.availability.phase,
            statusLoaded: repo.data.statusLoaded,
            statusPhase: repo.resources.status.phase,
            statusLoadedAt: repo.resources.status.loadedAt,
            statusStale:
              repo.resources.status.stale || !repo.data.statusLoaded || repo.resources.status.loadedAt === null,
          })
        )
          return
        await state.refreshStatus(id, { token: repo.instanceToken })
      }),
    )
  }, [workspace])

  useEffect(() => {
    refreshExpiredMembers()
    const refreshVisibleMembers = () => {
      if (document.visibilityState === 'visible') refreshExpiredMembers()
    }
    window.addEventListener('focus', refreshVisibleMembers)
    document.addEventListener('visibilitychange', refreshVisibleMembers)
    return () => {
      window.removeEventListener('focus', refreshVisibleMembers)
      document.removeEventListener('visibilitychange', refreshVisibleMembers)
    }
  }, [memberInstancesKey, refreshExpiredMembers, selectionKey])
}
