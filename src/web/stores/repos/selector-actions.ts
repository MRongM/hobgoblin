import type { ReposStore } from '#/web/stores/repos/types.ts'

export interface LocalWorkspaceStoreActions extends Pick<ReposStore, 'setBranchSearchQuery'> {}

export interface RestorableWorkspaceNavigationStoreActions extends Pick<
  ReposStore,
  'setActive' | 'reorderRepos' | 'cycleActive'
> {}

export interface RestorableWorkspaceViewportStoreActions extends Pick<ReposStore, 'setActive' | 'cycleActive'> {}

export interface RestorableWorkspaceOrderStoreActions extends Pick<ReposStore, 'reorderRepos'> {}

export interface RestorableWorkspaceLayoutStoreActions extends Pick<
  ReposStore,
  'setDetailCollapsed' | 'toggleDetailCollapsed' | 'setWorkspaceLayout' | 'resetLayout' | 'setSelectedTerminal'
> {}

export interface RestorableWorkspaceDetailVisibilityStoreActions extends Pick<
  ReposStore,
  'setDetailCollapsed' | 'toggleDetailCollapsed'
> {}

export interface RestorableWorkspaceLayoutPreferenceStoreActions extends Pick<
  ReposStore,
  'setWorkspaceLayout' | 'resetLayout' | 'setSelectedTerminal'
> {}

export interface RuntimeCoherentRepoOpenStoreActions extends Pick<ReposStore, 'ensureWorkspaceOpen'> {}

export interface RuntimeCoherentRepoNavigationStoreActions extends Pick<
  ReposStore,
  'closeRepo' | 'selectBranch' | 'selectDetachedWorktree' | 'setDetailTab'
> {}

export interface RestorableWorkspaceStoreActions extends Pick<
  ReposStore,
  | 'setActive'
  | 'reorderRepos'
  | 'cycleActive'
  | 'setDetailCollapsed'
  | 'toggleDetailCollapsed'
  | 'setWorkspaceLayout'
  | 'resetLayout'
  | 'setSelectedTerminal'
> {}

export interface RuntimeCoherentRepoProjectionStoreActions extends Pick<
  ReposStore,
  'ensureWorkspaceOpen' | 'closeRepo' | 'selectBranch' | 'selectDetachedWorktree' | 'setDetailTab'
> {}

export interface MainWindowNavigationStoreActions extends Pick<
  ReposStore,
  | 'setActive'
  | 'activateProject'
  | 'closeRepo'
  | 'cycleActive'
  | 'selectBranch'
  | 'selectDetachedWorktree'
  | 'setDetailTab'
> {}

export interface RepoTabStoreActions extends Pick<ReposStore, 'ensureWorkspaceOpen' | 'reorderRepos'> {}

export interface RendererEffectIntentStoreActions extends Pick<
  ReposStore,
  'ensureWorkspaceOpen' | 'setDetailCollapsed' | 'setSelectedTerminal'
> {}

export interface BranchDetailToolbarStoreActions extends Pick<ReposStore, 'setDetailCollapsed'> {}

export interface DetailPanelStoreActions extends Pick<ReposStore, 'setDetailCollapsed'> {}

export function localWorkspaceStoreActionsFromStore(
  state: Pick<ReposStore, 'setBranchSearchQuery'>,
): LocalWorkspaceStoreActions {
  return {
    setBranchSearchQuery: state.setBranchSearchQuery,
  }
}

export function restorableWorkspaceViewportStoreActionsFromStore(
  state: Pick<ReposStore, 'setActive' | 'cycleActive'>,
): RestorableWorkspaceViewportStoreActions {
  return {
    setActive: state.setActive,
    cycleActive: state.cycleActive,
  }
}

export function restorableWorkspaceOrderStoreActionsFromStore(
  state: Pick<ReposStore, 'reorderRepos'>,
): RestorableWorkspaceOrderStoreActions {
  return {
    reorderRepos: state.reorderRepos,
  }
}

export function restorableWorkspaceNavigationStoreActionsFromStore(
  state: Pick<ReposStore, 'setActive' | 'reorderRepos' | 'cycleActive'>,
): RestorableWorkspaceNavigationStoreActions {
  return {
    setActive: state.setActive,
    reorderRepos: state.reorderRepos,
    cycleActive: state.cycleActive,
  }
}

export function runtimeCoherentRepoOpenStoreActionsFromStore(
  state: Pick<ReposStore, 'ensureWorkspaceOpen'>,
): RuntimeCoherentRepoOpenStoreActions {
  return {
    ensureWorkspaceOpen: state.ensureWorkspaceOpen,
  }
}

export function runtimeCoherentRepoNavigationStoreActionsFromStore(
  state: Pick<ReposStore, 'closeRepo' | 'selectBranch' | 'selectDetachedWorktree' | 'setDetailTab'>,
): RuntimeCoherentRepoNavigationStoreActions {
  return {
    closeRepo: state.closeRepo,
    selectBranch: state.selectBranch,
    selectDetachedWorktree: state.selectDetachedWorktree,
    setDetailTab: state.setDetailTab,
  }
}

export function restorableWorkspaceLayoutStoreActionsFromStore(
  state: Pick<
    ReposStore,
    'setDetailCollapsed' | 'toggleDetailCollapsed' | 'setWorkspaceLayout' | 'resetLayout' | 'setSelectedTerminal'
  >,
): RestorableWorkspaceLayoutStoreActions {
  return {
    setDetailCollapsed: state.setDetailCollapsed,
    toggleDetailCollapsed: state.toggleDetailCollapsed,
    setWorkspaceLayout: state.setWorkspaceLayout,
    resetLayout: state.resetLayout,
    setSelectedTerminal: state.setSelectedTerminal,
  }
}

export function restorableWorkspaceDetailVisibilityStoreActionsFromStore(
  state: Pick<ReposStore, 'setDetailCollapsed' | 'toggleDetailCollapsed'>,
): RestorableWorkspaceDetailVisibilityStoreActions {
  return {
    setDetailCollapsed: state.setDetailCollapsed,
    toggleDetailCollapsed: state.toggleDetailCollapsed,
  }
}

export function restorableWorkspaceLayoutPreferenceStoreActionsFromStore(
  state: Pick<ReposStore, 'setWorkspaceLayout' | 'resetLayout' | 'setSelectedTerminal'>,
): RestorableWorkspaceLayoutPreferenceStoreActions {
  return {
    setWorkspaceLayout: state.setWorkspaceLayout,
    resetLayout: state.resetLayout,
    setSelectedTerminal: state.setSelectedTerminal,
  }
}

export function restorableWorkspaceStoreActionsFromStore(
  state: Pick<
    ReposStore,
    | 'setActive'
    | 'reorderRepos'
    | 'cycleActive'
    | 'setDetailCollapsed'
    | 'toggleDetailCollapsed'
    | 'setWorkspaceLayout'
    | 'resetLayout'
    | 'setSelectedTerminal'
  >,
): RestorableWorkspaceStoreActions {
  return {
    setActive: state.setActive,
    reorderRepos: state.reorderRepos,
    cycleActive: state.cycleActive,
    setDetailCollapsed: state.setDetailCollapsed,
    toggleDetailCollapsed: state.toggleDetailCollapsed,
    setWorkspaceLayout: state.setWorkspaceLayout,
    resetLayout: state.resetLayout,
    setSelectedTerminal: state.setSelectedTerminal,
  }
}

export function runtimeCoherentRepoProjectionStoreActionsFromStore(
  state: Pick<
    ReposStore,
    'ensureWorkspaceOpen' | 'closeRepo' | 'selectBranch' | 'selectDetachedWorktree' | 'setDetailTab'
  >,
): RuntimeCoherentRepoProjectionStoreActions {
  const open = runtimeCoherentRepoOpenStoreActionsFromStore({ ensureWorkspaceOpen: state.ensureWorkspaceOpen })
  const navigation = runtimeCoherentRepoNavigationStoreActionsFromStore({
    closeRepo: state.closeRepo,
    selectBranch: state.selectBranch,
    selectDetachedWorktree: state.selectDetachedWorktree,
    setDetailTab: state.setDetailTab,
  })
  return {
    ensureWorkspaceOpen: open.ensureWorkspaceOpen,
    closeRepo: navigation.closeRepo,
    selectBranch: navigation.selectBranch,
    selectDetachedWorktree: navigation.selectDetachedWorktree,
    setDetailTab: navigation.setDetailTab,
  }
}

export function mainWindowNavigationStoreActionsFromStore(
  state: Pick<
    ReposStore,
    | 'setActive'
    | 'activateProject'
    | 'cycleActive'
    | 'closeRepo'
    | 'selectBranch'
    | 'selectDetachedWorktree'
    | 'setDetailTab'
  >,
): MainWindowNavigationStoreActions {
  const restorable = restorableWorkspaceViewportStoreActionsFromStore({
    setActive: state.setActive,
    cycleActive: state.cycleActive,
  })
  const runtimeCoherent = runtimeCoherentRepoNavigationStoreActionsFromStore({
    closeRepo: state.closeRepo,
    selectBranch: state.selectBranch,
    selectDetachedWorktree: state.selectDetachedWorktree,
    setDetailTab: state.setDetailTab,
  })
  return {
    setActive: restorable.setActive,
    activateProject: state.activateProject,
    closeRepo: runtimeCoherent.closeRepo,
    cycleActive: restorable.cycleActive,
    selectBranch: runtimeCoherent.selectBranch,
    selectDetachedWorktree: runtimeCoherent.selectDetachedWorktree,
    setDetailTab: runtimeCoherent.setDetailTab,
  }
}

export function repoTabStoreActionsFromStore(
  state: Pick<ReposStore, 'ensureWorkspaceOpen' | 'reorderRepos'>,
): RepoTabStoreActions {
  const restorable = restorableWorkspaceOrderStoreActionsFromStore({ reorderRepos: state.reorderRepos })
  const runtimeCoherent = runtimeCoherentRepoOpenStoreActionsFromStore({
    ensureWorkspaceOpen: state.ensureWorkspaceOpen,
  })
  return {
    ensureWorkspaceOpen: runtimeCoherent.ensureWorkspaceOpen,
    reorderRepos: restorable.reorderRepos,
  }
}

export function rendererEffectIntentStoreActionsFromStore(
  state: Pick<ReposStore, 'ensureWorkspaceOpen' | 'setDetailCollapsed' | 'setSelectedTerminal'>,
): RendererEffectIntentStoreActions {
  const runtimeCoherent = runtimeCoherentRepoOpenStoreActionsFromStore({
    ensureWorkspaceOpen: state.ensureWorkspaceOpen,
  })
  return {
    ensureWorkspaceOpen: runtimeCoherent.ensureWorkspaceOpen,
    setDetailCollapsed: state.setDetailCollapsed,
    setSelectedTerminal: state.setSelectedTerminal,
  }
}

export function branchDetailToolbarStoreActionsFromStore(
  state: Pick<ReposStore, 'setDetailCollapsed'>,
): BranchDetailToolbarStoreActions {
  return {
    setDetailCollapsed: state.setDetailCollapsed,
  }
}

export function detailPanelStoreActionsFromStore(
  state: Pick<ReposStore, 'setDetailCollapsed'>,
): DetailPanelStoreActions {
  return {
    setDetailCollapsed: state.setDetailCollapsed,
  }
}

export function mainWindowNavigationStoreActionsEqual(
  a: MainWindowNavigationStoreActions,
  b: MainWindowNavigationStoreActions,
): boolean {
  return (
    a.setActive === b.setActive &&
    a.activateProject === b.activateProject &&
    a.closeRepo === b.closeRepo &&
    a.cycleActive === b.cycleActive &&
    a.selectBranch === b.selectBranch &&
    a.selectDetachedWorktree === b.selectDetachedWorktree &&
    a.setDetailTab === b.setDetailTab
  )
}

export function repoTabStoreActionsEqual(a: RepoTabStoreActions, b: RepoTabStoreActions): boolean {
  return a.ensureWorkspaceOpen === b.ensureWorkspaceOpen && a.reorderRepos === b.reorderRepos
}

export function rendererEffectIntentStoreActionsEqual(
  a: RendererEffectIntentStoreActions,
  b: RendererEffectIntentStoreActions,
): boolean {
  return (
    a.ensureWorkspaceOpen === b.ensureWorkspaceOpen &&
    a.setDetailCollapsed === b.setDetailCollapsed &&
    a.setSelectedTerminal === b.setSelectedTerminal
  )
}

export function branchDetailToolbarStoreActionsEqual(
  a: BranchDetailToolbarStoreActions,
  b: BranchDetailToolbarStoreActions,
): boolean {
  return a.setDetailCollapsed === b.setDetailCollapsed
}

export function detailPanelStoreActionsEqual(a: DetailPanelStoreActions, b: DetailPanelStoreActions): boolean {
  return a.setDetailCollapsed === b.setDetailCollapsed
}
