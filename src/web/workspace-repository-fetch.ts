import {
  fetchBranchWorkspaceRepositories,
  type BranchWorkspaceRepositoryFetchResult,
} from '#/web/branch-workspace-repository-fetch.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

export async function fetchWorkspaceRepositories(
  workspaceRootId: string,
): Promise<BranchWorkspaceRepositoryFetchResult> {
  const state = useReposStore.getState()
  const workspace = state.workspaceProjects[workspaceRootId]
  const candidateNameById = new Map(
    (workspace?.candidates ?? []).map((candidate) => [candidate.id, candidate.name] as const),
  )
  const targets = (workspace?.repositoryIds ?? []).map((repositoryId) => ({
    id: repositoryId,
    name: candidateNameById.get(repositoryId) ?? state.repos[repositoryId]?.name ?? repositoryId,
  }))

  return await fetchBranchWorkspaceRepositories(targets, async (target) => {
    const currentRepository = useReposStore.getState().repos[target.id]
    if (!currentRepository) return { ok: false, message: 'error.failed-read-repo' }
    return await useReposStore.getState().syncAndRefresh(target.id, { token: currentRepository.instanceToken })
  })
}
