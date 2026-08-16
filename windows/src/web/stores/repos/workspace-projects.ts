import type { WorkspaceProjectState } from '#/web/stores/repos/types.ts'
import type { WorkspaceActiveContext } from '#/shared/rpc.ts'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

interface WorkspaceProjectRepoLike {
  id?: string
  workspaceRootId?: string
}

interface WorkspaceProjectLookupState {
  activeId: string | null
  activeProjectId?: string | null
  repos: Record<string, WorkspaceProjectRepoLike | undefined>
  workspaceProjects: Record<string, WorkspaceProjectState | undefined>
  workspaceActiveContextByRoot: Record<string, WorkspaceActiveContext | undefined>
}

export function workspaceRootIdForRepo(
  state: Pick<WorkspaceProjectLookupState, 'repos'>,
  repoId: string,
): string | null {
  return state.repos[repoId]?.workspaceRootId ?? null
}

export function activeProjectId(
  state: Pick<WorkspaceProjectLookupState, 'activeId' | 'activeProjectId' | 'repos'>,
): string | null {
  if (!state.activeId) return null
  if (state.activeProjectId) return state.activeProjectId
  return workspaceRootIdForRepo(state, state.activeId) ?? state.activeId
}

export function activeWorkspaceRootId(
  state: Pick<WorkspaceProjectLookupState, 'activeId' | 'activeProjectId' | 'repos' | 'workspaceProjects'>,
): string | null {
  const projectId = activeProjectId(state)
  return projectId && state.workspaceProjects[projectId] ? projectId : null
}

export function workspaceActiveContext(
  state: Pick<WorkspaceProjectLookupState, 'repos' | 'workspaceProjects' | 'workspaceActiveContextByRoot'>,
  rootId: string,
  branchWorkspaces: readonly BranchWorkspaceSnapshot[] = [],
): WorkspaceActiveContext {
  const workspace = state.workspaceProjects[rootId]
  const context = state.workspaceActiveContextByRoot[rootId]
  if (!workspace || !context || context.kind === 'overview') return { kind: 'overview' }
  if (context.kind === 'repository') {
    return workspace.repositoryIds.includes(context.repositoryId) && state.repos[context.repositoryId]
      ? context
      : { kind: 'overview' }
  }
  const branchWorkspace = branchWorkspaces.find((item) => item.id === context.branchWorkspaceId)
  return branchWorkspace?.available ? context : { kind: 'overview' }
}

export function projectRepositoryIds(
  state: Pick<WorkspaceProjectLookupState, 'repos' | 'workspaceProjects'>,
  projectId: string,
): string[] {
  const workspace = state.workspaceProjects[projectId]
  if (workspace) return workspace.repositoryIds
  return state.repos[projectId] ? [projectId] : []
}

export function workspaceRepositoryListExpanded(
  state: { workspaceRepositoryListExpandedByRoot?: Record<string, boolean | undefined> },
  rootId: string,
): boolean {
  return state.workspaceRepositoryListExpandedByRoot?.[rootId] ?? true
}
