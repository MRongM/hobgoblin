import { refreshBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { projectDiscoveredBranchWorkspaceRepositories } from '#/web/branch-workspace-repository-projection.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

/** Open a server-confirmed folder destination without requiring configured Git members. */
export async function openRegisteredBranchWorkspace(rootId: string, branchWorkspaceId: string): Promise<void> {
  const opened = await useReposStore.getState().ensureWorkspaceOpen(rootId)
  if (!opened.ok) throw new Error(opened.message)
  const destinationRootId = opened.id
  await useReposStore.getState().rescanWorkspace(destinationRootId)
  const result = await refreshBranchWorkspaceQuery(mainWindowQueryClient, destinationRootId)
  if (!result.ok) throw new Error(result.message)
  if (!result.items.some((folder) => folder.id === branchWorkspaceId)) {
    throw new Error('workspace.branch-workspace.folder-register.failed')
  }
  const projection = projectDiscoveredBranchWorkspaceRepositories(
    useReposStore.getState(),
    destinationRootId,
    result.items,
  )
  useReposStore.setState((state) => ({
    repos: projection.repos,
    order: projection.order,
    workspaceProjects: state.workspaceProjects[destinationRootId]
      ? state.workspaceProjects
      : {
          ...state.workspaceProjects,
          [destinationRootId]: {
            rootId: destinationRootId,
            repositoryIds: [],
            candidates: [],
            configured: false,
            configurationError: null,
            phase: 'ready' as const,
            skipped: [],
            error: null,
          },
        },
  }))
  for (const repositoryId of projection.refreshIds) {
    void useReposStore
      .getState()
      .refreshCoreData(repositoryId)
      .catch(() => undefined)
  }
  useReposStore.getState().activateBranchWorkspace(destinationRootId, branchWorkspaceId)
}
