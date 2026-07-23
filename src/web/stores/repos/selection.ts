import { arrayMove } from '@dnd-kit/sortable'
import { normalizeWorktreePathOrder } from '#/web/stores/repos/branch-view-mode.ts'
import {
  explorerTabForRepo as explorerTabForRepoSelection,
  replaceRepo,
  replaceRepoState,
} from '#/web/stores/repos/helpers.ts'
import { persistRestorableRepoSnapshot } from '#/web/stores/repos/persistence.ts'
import {
  DEFAULT_DETAIL_COLLAPSED,
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_FILE_TREE_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
  effectiveDetailCollapsed,
  normalizeDetailPaneSize,
  normalizeDetailPaneSizes,
  normalizeFileTreePaneSize,
  normalizeWorkspaceSessionLayoutState,
  workspaceLayoutAllowsDetailCollapse,
} from '#/shared/workspace-layout.ts'
import type { DetailTab, RepoWorkspaceLayout, ReposGet, ReposSet, ReposStore } from '#/web/stores/repos/types.ts'
import type { WorkspaceDetailPaneSizes } from '#/shared/workspace-layout.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'
import { detailTabForWorktree } from '#/web/lib/detail-tabs.ts'
import { activeProjectId } from '#/web/stores/repos/workspace-projects.ts'
import { workspaceActiveContext, workspaceRepositoryListExpanded } from '#/web/stores/repos/workspace-projects.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import type { BranchWorkspaceReadResult, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import type { WorkspaceActiveContext } from '#/shared/rpc.ts'
function branchHasWorktree(repo: RepoState, branchName: string | null): boolean {
  return !!branchName && repo.data.branches.some((branch) => branch.name === branchName && !!branch.worktree?.path)
}

function detailTabForSelection(repo: RepoState, tab: DetailTab, selectedBranch = repo.ui.selectedBranch): DetailTab {
  if (repo.isGitRepo === false && tab === 'terminal') return 'terminal'
  return detailTabForWorktree(tab, branchHasWorktree(repo, selectedBranch))
}

function branchWorkspaceSnapshots(rootId: string): BranchWorkspaceSnapshot[] {
  const result = mainWindowQueryClient.getQueryData<BranchWorkspaceReadResult>(branchWorkspaceQueryKey(rootId))
  return result?.ok ? result.items : []
}

function workspaceContextsEqual(left: WorkspaceActiveContext | undefined, right: WorkspaceActiveContext): boolean {
  if (!left || left.kind !== right.kind) return false
  if (left.kind === 'repository' && right.kind === 'repository') return left.repositoryId === right.repositoryId
  if (left.kind === 'branch-workspace' && right.kind === 'branch-workspace') {
    return (
      left.branchWorkspaceId === right.branchWorkspaceId && left.memberRepositoryName === right.memberRepositoryName
    )
  }
  return left.kind === 'overview' && right.kind === 'overview'
}

function activateWorkspaceContext(
  set: ReposSet,
  state: ReposStore,
  rootId: string,
  context: WorkspaceActiveContext,
): void {
  const activeId = context.kind === 'repository' ? context.repositoryId : rootId
  const repo = state.repos[activeId]
  if (!repo) return
  set({
    activeId,
    activeProjectId: rootId,
    workspaceLayout: repo.ui.workspaceLayout,
    workspaceActiveContextByRoot: {
      ...state.workspaceActiveContextByRoot,
      [rootId]: context,
    },
  })
}

type RestorableWorkspaceSelectionActions = Pick<
  ReposStore,
  | 'setActive'
  | 'activateProject'
  | 'activateWorkspaceOverview'
  | 'activateWorkspaceRepository'
  | 'activateBranchWorkspace'
  | 'setWorkspaceRepositoryListExpanded'
  | 'toggleWorkspaceRepositoryList'
  | 'setProjectListExpanded'
  | 'toggleProjectListExpanded'
  | 'reorderRepos'
  | 'cycleActive'
  | 'setDetailCollapsed'
  | 'toggleDetailCollapsed'
  | 'setWorkspaceLayout'
  | 'applySessionLayoutState'
  | 'applySessionSelectedTerminalState'
  | 'setDetailPaneSize'
  | 'setDetailPaneSizes'
  | 'setExplorerTab'
  | 'setRepoFileTreePaneSize'
  | 'setDefaultFileTreePaneSize'
  | 'resetLayout'
  | 'setSelectedTerminal'
  | 'reorderWorktrees'
>

type LocalWorkspaceSelectionActions = Pick<ReposStore, 'setBranchSearchQuery'>

type RuntimeCoherentSelectionActions = Pick<ReposStore, 'setDetailTab' | 'dismissExitedTerminalDetail' | 'selectBranch'>

type RepoMutationSelectionActions = Pick<ReposStore, 'checkoutSelectedInRepo' | 'checkoutSelected'>

function createRestorableWorkspaceSelectionActions(set: ReposSet, get: ReposGet): RestorableWorkspaceSelectionActions {
  return {
    setActive(id: string) {
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        const standaloneProject = s.order.includes(id) && !s.workspaceProjects[id]
        const workspaceRootId = standaloneProject
          ? null
          : (repo.workspaceRootId ?? (s.workspaceProjects[id] ? id : null))
        const workspaceContext =
          repo.workspaceRootId && !standaloneProject
            ? ({ kind: 'repository', repositoryId: id } as const)
            : ({ kind: 'overview' } as const)
        const nextActiveProjectId = workspaceRootId ?? id
        if (
          s.activeId === id &&
          s.activeProjectId === nextActiveProjectId &&
          s.workspaceLayout === repo.ui.workspaceLayout &&
          (!workspaceRootId ||
            workspaceContextsEqual(s.workspaceActiveContextByRoot[workspaceRootId], workspaceContext))
        ) {
          return s
        }
        return {
          activeId: id,
          activeProjectId: nextActiveProjectId,
          workspaceLayout: repo.ui.workspaceLayout,
          ...(workspaceRootId
            ? {
                workspaceActiveContextByRoot: {
                  ...s.workspaceActiveContextByRoot,
                  [workspaceRootId]: workspaceContext,
                },
              }
            : {}),
        }
      })
    },

    activateProject(id: string) {
      const state = get()
      const workspace = state.workspaceProjects[id]
      if (!workspace) {
        get().setActive(id)
        return
      }
      const context = workspaceActiveContext(state, id, branchWorkspaceSnapshots(id))
      activateWorkspaceContext(set, state, id, context)
    },

    activateWorkspaceOverview(rootId: string) {
      const state = get()
      if (!state.workspaceProjects[rootId] || !state.repos[rootId]) return
      activateWorkspaceContext(set, state, rootId, { kind: 'overview' })
    },

    activateWorkspaceRepository(rootId: string, repoId: string) {
      const state = get()
      const workspace = state.workspaceProjects[rootId]
      if (!workspace) return
      if (!workspace.repositoryIds.includes(repoId) || !state.repos[repoId]) return
      activateWorkspaceContext(set, state, rootId, { kind: 'repository', repositoryId: repoId })
    },

    activateBranchWorkspace(rootId: string, branchWorkspaceId: string, memberRepositoryName?: string) {
      const state = get()
      if (!state.workspaceProjects[rootId] || !state.repos[rootId]) return
      const requested = {
        kind: 'branch-workspace' as const,
        branchWorkspaceId,
        ...(memberRepositoryName ? { memberRepositoryName } : {}),
      }
      const next = workspaceActiveContext(
        { ...state, workspaceActiveContextByRoot: { ...state.workspaceActiveContextByRoot, [rootId]: requested } },
        rootId,
        branchWorkspaceSnapshots(rootId),
      )
      activateWorkspaceContext(set, state, rootId, next)
    },

    setWorkspaceRepositoryListExpanded(rootId: string, expanded: boolean) {
      set((state) => {
        if (!state.workspaceProjects[rootId]) return state
        if (state.workspaceRepositoryListExpandedByRoot[rootId] === expanded) return state
        return {
          workspaceRepositoryListExpandedByRoot: {
            ...state.workspaceRepositoryListExpandedByRoot,
            [rootId]: expanded,
          },
        }
      })
    },

    toggleWorkspaceRepositoryList(rootId: string) {
      set((state) => {
        if (!state.workspaceProjects[rootId]) return state
        return {
          workspaceRepositoryListExpandedByRoot: {
            ...state.workspaceRepositoryListExpandedByRoot,
            [rootId]: !workspaceRepositoryListExpanded(state, rootId),
          },
        }
      })
    },

    setProjectListExpanded(expanded: boolean) {
      set((state) => (state.projectListExpanded === expanded ? state : { projectListExpanded: expanded }))
    },

    toggleProjectListExpanded() {
      set((state) => ({ projectListExpanded: !state.projectListExpanded }))
    },

    reorderRepos(fromId: string, toId: string) {
      if (fromId === toId) return
      set((s) => {
        const from = s.order.indexOf(fromId)
        const to = s.order.indexOf(toId)
        if (from === -1 || to === -1) return s
        return { order: arrayMove(s.order, from, to) }
      })
    },

    cycleActive(direction: 1 | -1) {
      const state = get()
      if (state.order.length === 0) return
      const projectId = activeProjectId(state)
      const idx = projectId ? state.order.indexOf(projectId) : -1
      const nextIdx = idx === -1 ? 0 : (idx + direction + state.order.length) % state.order.length
      const nextProjectId = state.order[nextIdx]
      if (!nextProjectId || nextProjectId === projectId) return
      get().activateProject(nextProjectId)
    },

    setDetailCollapsed(collapsed: boolean) {
      set((s) => {
        const next = effectiveDetailCollapsed(s.workspaceLayout, collapsed)
        return s.detailCollapsed === next ? s : { detailCollapsed: next }
      })
    },

    toggleDetailCollapsed() {
      set((s) => {
        if (!workspaceLayoutAllowsDetailCollapse(s.workspaceLayout)) return s
        return { detailCollapsed: !s.detailCollapsed }
      })
    },

    setWorkspaceLayout(idOrLayout: string, explicitLayout?: RepoWorkspaceLayout) {
      const id = explicitLayout ? idOrLayout : get().activeId
      const layout = explicitLayout ?? (idOrLayout as RepoWorkspaceLayout)
      if (!id) {
        set((s) => {
          const detailCollapsed = effectiveDetailCollapsed(layout, s.detailCollapsed)
          if (s.workspaceLayout === layout && s.detailCollapsed === detailCollapsed) {
            return s
          }
          return { workspaceLayout: layout, detailCollapsed }
        })
        return
      }
      let changed = false
      let token: number | undefined
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        if (repo.ui.workspaceLayout === layout && (s.activeId !== id || s.workspaceLayout === layout)) return s
        changed = true
        token = repo.instanceToken
        const isActiveRepo = s.activeId === id
        const detailCollapsed = isActiveRepo ? effectiveDetailCollapsed(layout, s.detailCollapsed) : s.detailCollapsed
        return {
          workspaceLayout: isActiveRepo ? layout : s.workspaceLayout,
          detailCollapsed,
          repos: {
            ...s.repos,
            [id]: replaceRepo(repo, (r) => {
              r.ui.workspaceLayout = layout
            }),
          },
        }
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },

    applySessionLayoutState(layoutState: Parameters<ReposStore['applySessionLayoutState']>[0]) {
      // One-shot boot/session restore of restorable layout fields. Runtime
      // layout edits still originate from the renderer and are persisted later
      // through useSessionPersistence.
      set((s) => {
        const next = normalizeWorkspaceSessionLayoutState(layoutState)
        if (
          s.workspaceLayout === next.workspaceLayout &&
          s.detailCollapsed === next.detailCollapsed &&
          s.detailPaneSizes['left-right'] === next.detailPaneSizes['left-right'] &&
          s.fileTreePaneSizes['left-right'] === next.fileTreePaneSizes['left-right']
        ) {
          return s
        }
        return {
          workspaceLayout: next.workspaceLayout,
          detailCollapsed: next.detailCollapsed,
          detailPaneSizes: next.detailPaneSizes,
          fileTreePaneSizes: next.fileTreePaneSizes,
        }
      })
    },

    applySessionSelectedTerminalState(selectedTerminalByWorktree: Record<string, string>) {
      // One-shot boot/session restore of per-worktree terminal selection. This
      // seeds renderer state; later selection changes remain renderer-owned.
      set((s) => {
        const current = s.selectedTerminalByWorktree
        const currentEntries = Object.entries(current)
        const nextEntries = Object.entries(selectedTerminalByWorktree)
        if (
          currentEntries.length === nextEntries.length &&
          nextEntries.every(([worktreeKey, key]) => current[worktreeKey] === key)
        ) {
          return s
        }
        return { selectedTerminalByWorktree: { ...selectedTerminalByWorktree } }
      })
    },

    setDetailPaneSize(layout: RepoWorkspaceLayout, size: number) {
      set((s) => {
        const next = normalizeDetailPaneSize(layout, size)
        if (s.detailPaneSizes[layout] === next) return s
        return { detailPaneSizes: { ...s.detailPaneSizes, [layout]: next } }
      })
    },

    setDetailPaneSizes(sizes: WorkspaceDetailPaneSizes) {
      set((s) => {
        const next = normalizeDetailPaneSizes(sizes)
        if (s.detailPaneSizes['left-right'] === next['left-right']) {
          return s
        }
        return { detailPaneSizes: next }
      })
    },

    setExplorerTab(id, tab) {
      let changed = false
      let token: number | undefined
      set((state) => {
        const repo = state.repos[id]
        if (!repo) return state
        // Compare against the effective tab (with fallback) so setting
        // the default `'files'` on an untouched branch stays a no-op —
        // matches the pre-migration behavior where an implicit 'files'
        // was already the value.
        if (explorerTabForRepoSelection(repo) === tab) return state
        const key = repo.ui.selectedBranch ?? ''
        changed = true
        token = repo.instanceToken
        return replaceRepoState(state, repo, (draft) => {
          draft.ui.explorerTabByBranch[key] = tab
        })
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },

    setRepoFileTreePaneSize(id: string, layout: RepoWorkspaceLayout, size: number) {
      let changed = false
      let token: number | undefined
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        const next = normalizeFileTreePaneSize(layout, size)
        const current = repo.ui.fileTreePaneSizes?.[layout] ?? s.fileTreePaneSizes[layout]
        if (current === next) return s
        changed = true
        token = repo.instanceToken
        return {
          repos: {
            ...s.repos,
            [id]: replaceRepo(repo, (r) => {
              r.ui.fileTreePaneSizes = {
                ...(r.ui.fileTreePaneSizes ?? s.fileTreePaneSizes),
                [layout]: next,
              }
            }),
          },
        }
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },

    setDefaultFileTreePaneSize(layout: RepoWorkspaceLayout, size: number) {
      set((s) => {
        const next = normalizeFileTreePaneSize(layout, size)
        if (s.fileTreePaneSizes[layout] === next) return s
        return { fileTreePaneSizes: { ...s.fileTreePaneSizes, [layout]: next } }
      })
    },

    resetLayout() {
      set((s) => {
        const detailCollapsed = effectiveDetailCollapsed(DEFAULT_WORKSPACE_LAYOUT, DEFAULT_DETAIL_COLLAPSED)
        if (
          s.workspaceLayout === DEFAULT_WORKSPACE_LAYOUT &&
          s.detailCollapsed === detailCollapsed &&
          s.detailPaneSizes['left-right'] === DEFAULT_DETAIL_PANE_SIZES['left-right'] &&
          s.fileTreePaneSizes['left-right'] === DEFAULT_FILE_TREE_PANE_SIZES['left-right']
        ) {
          return s
        }
        return {
          workspaceLayout: DEFAULT_WORKSPACE_LAYOUT,
          detailCollapsed,
          detailPaneSizes: DEFAULT_DETAIL_PANE_SIZES,
          fileTreePaneSizes: DEFAULT_FILE_TREE_PANE_SIZES,
        }
      })
    },

    setSelectedTerminal(worktreeTerminalKey: string, key: string | null) {
      set((s) => {
        const current = s.selectedTerminalByWorktree[worktreeTerminalKey]
        if (key) {
          if (current === key) return s
          return { selectedTerminalByWorktree: { ...s.selectedTerminalByWorktree, [worktreeTerminalKey]: key } }
        }
        if (current === undefined) return s
        const selectedTerminalByWorktree = { ...s.selectedTerminalByWorktree }
        delete selectedTerminalByWorktree[worktreeTerminalKey]
        return { selectedTerminalByWorktree }
      })
    },

    reorderWorktrees(id: string, fromPath: string, toPath: string) {
      if (fromPath === toPath) return
      let changed = false
      let token: number | undefined
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        const currentPaths = repo.data.branches
          .map((branch) => branch.worktree?.path)
          .filter((path): path is string => !!path)
        if (!currentPaths.includes(fromPath) || !currentPaths.includes(toPath)) return s
        const order = normalizeWorktreePathOrder(repo.ui.worktreePathOrder, currentPaths)
        const from = order.indexOf(fromPath)
        const to = order.indexOf(toPath)
        if (from === -1 || to === -1 || from === to) return s
        const worktreePathOrder = arrayMove(order, from, to)
        changed = true
        token = repo.instanceToken
        return replaceRepoState(s, repo, (r) => {
          r.ui.worktreePathOrder = worktreePathOrder
        })
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },
  }
}

function createLocalWorkspaceSelectionActions(set: ReposSet): LocalWorkspaceSelectionActions {
  return {
    setBranchSearchQuery(id: string, query: string) {
      set((s) => {
        if (!s.repos[id]) return s
        const hasQuery = query.trim().length > 0
        const currentQuery = s.branchSearchQueries[id]
        if (hasQuery ? currentQuery === query : currentQuery === undefined) return s
        const branchSearchQueries = { ...s.branchSearchQueries }
        if (hasQuery) branchSearchQueries[id] = query
        else delete branchSearchQueries[id]
        return { branchSearchQueries }
      })
    },
  }
}

function createRuntimeCoherentSelectionActions(set: ReposSet, get: ReposGet): RuntimeCoherentSelectionActions {
  return {
    setDetailTab(id: string, tab: DetailTab) {
      let changed = false
      let token: number | undefined
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        const nextTab = detailTabForSelection(repo, tab)
        if (repo.ui.detailTab === nextTab) return s
        changed = true
        token = repo.instanceToken
        return replaceRepoState(s, repo, (r) => {
          r.ui.detailTab = nextTab
        })
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },

    dismissExitedTerminalDetail(id: string, worktreePath: string, options?: { affectVisibleWorkspace?: boolean }) {
      let changed = false
      let token: number | undefined
      const affectVisibleWorkspace = options?.affectVisibleWorkspace === true
      set((s) => {
        const repo = s.repos[id]
        if (!repo || repo.ui.detailTab !== 'terminal') return s
        const branch = repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)
        if (branch?.worktree?.path !== worktreePath) return s
        changed = true
        token = repo.instanceToken
        const nextRepo = replaceRepo(repo, (r) => {
          r.ui.detailTab = 'status'
        })
        const detailCollapsed = affectVisibleWorkspace
          ? effectiveDetailCollapsed(s.workspaceLayout, true)
          : s.detailCollapsed
        if (nextRepo === repo && detailCollapsed === s.detailCollapsed) {
          return s
        }
        if (nextRepo === repo) return { detailCollapsed }
        return {
          // Terminal exits in background repos should not surprise the active workspace layout.
          detailCollapsed,
          repos: { ...s.repos, [id]: nextRepo },
        }
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },

    selectBranch(id: string, branch: string) {
      let changed = false
      let token: number | undefined
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        if (!repo.data.branches.some((b) => b.name === branch)) return s
        if (repo.ui.selectedBranch === branch) return s
        changed = true
        token = repo.instanceToken
        return replaceRepoState(s, repo, (r) => {
          r.ui.selectedBranch = branch
          r.ui.detailTab = detailTabForSelection(repo, r.ui.detailTab, branch)
        })
      })
      const repo = get().repos[id]
      if (changed && token !== undefined && repo) persistRestorableRepoSnapshot(set, repo, token)
    },
  }
}

function createRepoMutationSelectionActions(set: ReposSet, get: ReposGet): RepoMutationSelectionActions {
  return {
    async checkoutSelectedInRepo(id: string) {
      const state = get()
      const repo = state.repos[id]
      if (!repo) return
      if (repo.availability.phase === 'unavailable') return
      const token = repo.instanceToken
      const branch = repo.ui.selectedBranch
      if (!branch || branch === repo.data.currentBranch) return
      const branchInfo = repo.data.branches.find((b) => b.name === branch)
      if (!branchInfo || branchInfo.worktree?.path) return
      await get().runBranchAction(id, { kind: 'checkout', branch }, { token })
    },

    async checkoutSelected() {
      const id = get().activeId
      if (!id) return
      await get().checkoutSelectedInRepo(id)
    },
  }
}

export function createSelectionActions(set: ReposSet, get: ReposGet) {
  return {
    ...createRestorableWorkspaceSelectionActions(set, get),
    ...createLocalWorkspaceSelectionActions(set),
    ...createRuntimeCoherentSelectionActions(set, get),
    ...createRepoMutationSelectionActions(set, get),
  }
}
