import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { BranchWorkspaceReadResult, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { useRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoState, ReposStore } from '#/web/stores/repos/types.ts'
import { activeProjectId, projectRepositoryIds } from '#/web/stores/repos/workspace-projects.ts'

type ScheduledStatusRefreshState = Pick<ReposStore, 'activeId' | 'activeProjectId' | 'repos' | 'workspaceProjects'>

const STATUS_REFRESH_BATCH_SIZE = 5

function isScheduledStatusRefreshEligible(repo: RepoState | null | undefined): repo is RepoState {
  return !!repo && repo.isGitRepo && repo.availability.phase === 'available'
}

export function scheduledStatusRefreshRepoIdsFromStore(
  state: ScheduledStatusRefreshState,
  branchWorkspaces: readonly BranchWorkspaceSnapshot[] = [],
): string[] {
  const projectId = activeProjectId(state)
  if (!projectId) return []
  return projectRepositoryIds(state, projectId, branchWorkspaces).filter((id) =>
    isScheduledStatusRefreshEligible(state.repos[id]),
  )
}

export function useScheduledRepoStatusRefresh() {
  const projectId = useReposStore(activeProjectId)
  const queryClient = useQueryClient()
  const branchWorkspaceData = useSyncExternalStore(
    useCallback((onChange) => queryClient.getQueryCache().subscribe(onChange), [queryClient]),
    useCallback(
      () => queryClient.getQueryData<BranchWorkspaceReadResult>(branchWorkspaceQueryKey(projectId ?? '')),
      [queryClient, projectId],
    ),
  )
  const hasEligibleRepos = useReposStore(
    (state) =>
      scheduledStatusRefreshRepoIdsFromStore(state, branchWorkspaceData?.ok ? branchWorkspaceData.items : []).length >
      0,
  )
  const pendingRef = useRef(false)
  const { statusRefreshIntervalSec } = useRuntimeFetchSettings()

  useEffect(() => {
    if (statusRefreshIntervalSec <= 0 || !projectId || !hasEligibleRepos) return
    let lastRepoId: string | null = null
    const intervalId = window.setInterval(() => {
      const state = useReposStore.getState()
      if (pendingRef.current || activeProjectId(state) !== projectId) return
      const data = queryClient.getQueryData<BranchWorkspaceReadResult>(branchWorkspaceQueryKey(projectId))
      const repoIds = scheduledStatusRefreshRepoIdsFromStore(state, data?.ok ? data.items : [])
      if (repoIds.length === 0) return
      const start = lastRepoId ? (repoIds.indexOf(lastRepoId) + 1) % repoIds.length : 0
      const batch = repoIds.slice(start, start + STATUS_REFRESH_BATCH_SIZE)
      if (batch.length === 0) return
      lastRepoId = batch.at(-1)!
      pendingRef.current = true
      void Promise.allSettled(
        batch.map(async (id) => {
          const repo = useReposStore.getState().repos[id]
          if (!isScheduledStatusRefreshEligible(repo)) return
          await state.refreshCoreData(id, { token: repo.instanceToken })
        }),
      ).finally(() => {
        pendingRef.current = false
      })
    }, statusRefreshIntervalSec * 1_000)
    return () => window.clearInterval(intervalId)
  }, [projectId, hasEligibleRepos, statusRefreshIntervalSec, queryClient])
}
