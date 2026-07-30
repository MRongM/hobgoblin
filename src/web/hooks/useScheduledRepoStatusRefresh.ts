import { useEffect } from 'react'
import { useRuntimeFetchSettings } from '#/web/runtime-settings-fetch.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoState, ReposStore } from '#/web/stores/repos/types.ts'
import { activeProjectId, projectRepositoryIds } from '#/web/stores/repos/workspace-projects.ts'

type ScheduledStatusRefreshState = Pick<
  ReposStore,
  'activeId' | 'activeProjectId' | 'repos' | 'workspaceProjects'
>

function isScheduledStatusRefreshEligible(repo: RepoState | null | undefined): repo is RepoState {
  return !!repo && repo.isGitRepo && repo.availability.phase === 'available'
}

export function scheduledStatusRefreshRepoIdsFromStore(state: ScheduledStatusRefreshState): string[] {
  const projectId = activeProjectId(state)
  if (!projectId) return []
  return projectRepositoryIds(state, projectId).filter((id) => isScheduledStatusRefreshEligible(state.repos[id]))
}

export function useScheduledRepoStatusRefresh() {
  const repoIdsKey = useReposStore((state) => scheduledStatusRefreshRepoIdsFromStore(state).join('\0'))
  const { statusRefreshIntervalSec } = useRuntimeFetchSettings()

  useEffect(() => {
    if (statusRefreshIntervalSec <= 0 || !repoIdsKey) return
    const intervalId = window.setInterval(() => {
      const state = useReposStore.getState()
      const repoIds = scheduledStatusRefreshRepoIdsFromStore(state)
      void Promise.allSettled(
        repoIds.map(async (id) => {
          const repo = state.repos[id]
          if (!isScheduledStatusRefreshEligible(repo)) return
          await state.refreshStatus(id, { token: repo.instanceToken })
        }),
      )
    }, statusRefreshIntervalSec * 1_000)
    return () => window.clearInterval(intervalId)
  }, [repoIdsKey, statusRefreshIntervalSec])
}
