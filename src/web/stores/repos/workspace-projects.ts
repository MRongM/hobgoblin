import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'

interface WorkspaceProjectRepoLike {
  id?: string
  workspaceRootId?: string
}

interface WorkspaceProjectLookupState {
  activeId: string | null
  repos: Record<string, WorkspaceProjectRepoLike | undefined>
  workspaceProjects: Record<string, WorkspaceProjectState | undefined>
  workspaceActiveRepoByRoot: Record<string, string | null | undefined>
}

export function workspaceRootIdForRepo(
  state: Pick<WorkspaceProjectLookupState, 'repos'>,
  repoId: string,
): string | null {
  return state.repos[repoId]?.workspaceRootId ?? null
}

export function activeProjectId(
  state: Pick<WorkspaceProjectLookupState, 'activeId' | 'repos'>,
): string | null {
  if (!state.activeId) return null
  return workspaceRootIdForRepo(state, state.activeId) ?? state.activeId
}

export function projectActivationTarget(
  state: Pick<WorkspaceProjectLookupState, 'repos' | 'workspaceProjects' | 'workspaceActiveRepoByRoot'>,
  projectId: string,
): string {
  const workspace = state.workspaceProjects[projectId]
  if (!workspace) return projectId
  const saved = state.workspaceActiveRepoByRoot[projectId]
  return saved && workspace.repositoryIds.includes(saved) && state.repos[saved] ? saved : projectId
}

export function projectRepositoryIds(
  state: Pick<WorkspaceProjectLookupState, 'repos' | 'workspaceProjects'>,
  projectId: string,
): string[] {
  const workspace = state.workspaceProjects[projectId]
  if (workspace) return workspace.repositoryIds
  return state.repos[projectId] ? [projectId] : []
}
