import { useCallback } from 'react'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useRuntimeRecentRepos } from '#/web/settings-read-projection.ts'
import { clearRecentRepoHistory } from '#/web/settings-write-paths.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

export function useRecentReposMenuActions() {
  const recentRepos = useRuntimeRecentRepos()
  const ensureWorkspaceOpen = useReposStore((state) => state.ensureWorkspaceOpen)
  const navigation = useMainWindowNavigation()

  const openRecentRepo = useCallback(
    async (entry: RepoSessionEntry) => {
      const result = await ensureWorkspaceOpen(entry)
      if (result.ok) navigation.activateRepo(result.id)
    },
    [ensureWorkspaceOpen, navigation],
  )

  return {
    recentRepos,
    openRecentRepo: (entry: RepoSessionEntry) => void openRecentRepo(entry),
    clearRecentRepos: () => void clearRecentRepoHistory(),
  }
}
