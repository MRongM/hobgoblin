import type { SessionState, WorkspaceActiveContext } from '#/shared/rpc.ts'
import type { RestorableWorkspaceState, ReposStore } from '#/web/stores/repos/types.ts'
import { persistedOpenWorkspaceEntries } from '#/web/open-workspace-state.ts'
import {
  persistedActiveRepoIdForSession,
  persistedSelectedTerminalByWorktreeForSession,
} from '#/web/session-persistence-state.ts'
import { DEFAULT_FILE_TREE_PANE_SIZES } from '#/shared/workspace-layout.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

export function sessionStateFromRestorableWorkspaceState(input: {
  repos: ReposStore['repos']
  restorableWorkspaceState: RestorableWorkspaceState
}): SessionState {
  const { repos, restorableWorkspaceState } = input
  return {
    openRepos: persistedOpenWorkspaceEntries(restorableWorkspaceState.order, repos),
    activeRepo: persistedActiveRepoIdForSession(restorableWorkspaceState.activeId),
    workspaceActiveContextByRoot: restorableWorkspaceState.workspaceActiveContextByRoot,
    workspaceRepositoryListExpandedByRoot: restorableWorkspaceState.workspaceRepositoryListExpandedByRoot,
    projectListExpanded: restorableWorkspaceState.projectListExpanded,
    detailCollapsed: restorableWorkspaceState.detailCollapsed,
    detailFocusMode: false,
    workspaceLayout: restorableWorkspaceState.workspaceLayout,
    detailPaneSizes: restorableWorkspaceState.detailPaneSizes,
    fileTreePaneSizes: restorableWorkspaceState.fileTreePaneSizes,
    selectedTerminalByWorktree: persistedSelectedTerminalByWorktreeForSession(
      restorableWorkspaceState.selectedTerminalByWorktree,
      repos,
    ),
  }
}

/** Restores only the restorable workspace UI projection from SessionState.
 *  It intentionally does not establish a live binding back to SessionState;
 *  subsequent updates flow through useSessionPersistence. */
export function restoreRestorableWorkspaceStateFromSession(
  session: SessionState,
  activeId: string | null = session.activeRepo,
): Pick<
  RestorableWorkspaceState,
  | 'activeId'
  | 'workspaceActiveContextByRoot'
  | 'workspaceRepositoryListExpandedByRoot'
  | 'projectListExpanded'
  | 'detailCollapsed'
  | 'workspaceLayout'
  | 'detailPaneSizes'
  | 'fileTreePaneSizes'
  | 'selectedTerminalByWorktree'
> {
  return {
    activeId,
    workspaceActiveContextByRoot: normalizeWorkspaceActiveContexts(session),
    workspaceRepositoryListExpandedByRoot: normalizeWorkspaceRepositoryListExpansion(
      session.workspaceRepositoryListExpandedByRoot,
    ),
    projectListExpanded: session.projectListExpanded,
    detailCollapsed: session.detailCollapsed,
    workspaceLayout: session.workspaceLayout,
    detailPaneSizes: session.detailPaneSizes,
    fileTreePaneSizes: session.fileTreePaneSizes ?? DEFAULT_FILE_TREE_PANE_SIZES,
    selectedTerminalByWorktree: session.selectedTerminalByWorktree ?? {},
  }
}

function normalizeWorkspaceActiveContexts(session: SessionState): Record<string, WorkspaceActiveContext> {
  const contexts: Record<string, WorkspaceActiveContext> = {}
  const legacy = session.workspaceActiveRepoByRoot
  if (legacy && typeof legacy === 'object') {
    for (const [rootId, repositoryId] of Object.entries(legacy)) {
      if (!validWorkspaceContextId(rootId)) continue
      contexts[rootId] =
        repositoryId === null || repositoryId === rootId
          ? { kind: 'overview' }
          : validWorkspaceContextId(repositoryId)
            ? { kind: 'repository', repositoryId }
            : { kind: 'overview' }
    }
  }

  const tagged = session.workspaceActiveContextByRoot
  if (!tagged || typeof tagged !== 'object') return contexts
  for (const [rootId, value] of Object.entries(tagged)) {
    if (!validWorkspaceContextId(rootId)) continue
    const context = normalizeWorkspaceActiveContext(value)
    if (context) contexts[rootId] = context
    else delete contexts[rootId]
  }
  return contexts
}

function normalizeWorkspaceActiveContext(value: unknown): WorkspaceActiveContext | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<WorkspaceActiveContext>
  if (candidate.kind === 'overview') return { kind: 'overview' }
  if (candidate.kind === 'repository' && validWorkspaceContextId(candidate.repositoryId)) {
    return { kind: 'repository', repositoryId: candidate.repositoryId }
  }
  if (candidate.kind === 'branch-workspace' && validWorkspaceContextId(candidate.branchWorkspaceId)) {
    return {
      kind: 'branch-workspace',
      branchWorkspaceId: candidate.branchWorkspaceId,
      ...(isWorkspaceRepositoryName(candidate.memberRepositoryName)
        ? { memberRepositoryName: candidate.memberRepositoryName }
        : {}),
    }
  }
  return null
}

function normalizeWorkspaceRepositoryListExpansion(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {}
  const expandedByRoot: Record<string, boolean> = {}
  for (const [rootId, expanded] of Object.entries(value)) {
    if (validWorkspaceContextId(rootId) && typeof expanded === 'boolean') expandedByRoot[rootId] = expanded
  }
  return expandedByRoot
}

function validWorkspaceContextId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0')
}
