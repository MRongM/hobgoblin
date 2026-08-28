import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { FolderPlus, RefreshCw } from 'lucide-react'
import { BranchList } from '#/web/components/BranchList.tsx'
import { FileAreaSplitPane } from '#/web/components/repo-workspace/FileAreaSplitPane.tsx'
import { PlainWorkspacePane } from '#/web/components/repo-workspace/PlainWorkspacePane.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import type { ExplorerTab, RepoBranchState, RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { runRepoRefreshIntent } from '#/web/stores/repos/refresh-coordinator.ts'
import {
  RepoWorktreeExplorer,
  type FileTreeRevealRequest,
} from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'
import type { CompactWorkspaceSurface } from '#/web/components/repo-workspace/model.ts'
import { activeWorkspaceRootId } from '#/web/stores/repos/workspace-projects.ts'
import { selectedRepoWorktree } from '#/web/stores/repos/worktree-selection.ts'

interface RepoExplorerPaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  showActions: boolean
  revealRequest?: FileTreeRevealRequest | null
  plainWorkspaceTerminalPanel?: ReactNode
  fileAreaCollapsed?: boolean
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
  onCollapseFileArea?: () => void
  compactSurface?: Exclude<CompactWorkspaceSurface, 'detail'>
  onShowCompactDetail?: () => void
  onShowCompactFiles?: () => void
  onBranchSelected?: () => void
  terminalFocusMode?: boolean
  onMaximizeTerminal?: () => void
  onExitTerminalFocus?: () => void
}

export function RepoExplorerPane({
  repoId,
  layout,
  showActions,
  revealRequest,
  plainWorkspaceTerminalPanel,
  fileAreaCollapsed = false,
  onToggleFileArea,
  onOpenFileArea,
  onCollapseFileArea,
  compactSurface,
  onShowCompactDetail,
  onShowCompactFiles,
  onBranchSelected,
  terminalFocusMode = false,
  onMaximizeTerminal,
  onExitTerminalFocus,
}: RepoExplorerPaneProps) {
  const {
    activeTab,
    repoFileTreePaneSizes,
    defaultFileTreePaneSizes,
    setExplorerTab,
    setRepoFileTreePaneSize,
    changeCount,
  } = useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      const selected = repo ? selectedRepoWorktree(repo) : null
      const worktreePath = selected?.worktreePath
      return {
        activeTab: repo ? explorerTabForRepo(repo) : 'files',
        repoFileTreePaneSizes: repo?.ui.fileTreePaneSizes,
        defaultFileTreePaneSizes: state.fileTreePaneSizes,
        setExplorerTab: state.setExplorerTab,
        setRepoFileTreePaneSize: state.setRepoFileTreePaneSize,
        changeCount: worktreePath
          ? (repo?.data.status.find((status) => status.path === worktreePath)?.entries.length ?? 0)
          : 0,
      }
    },
    (a, b) =>
      a.activeTab === b.activeTab &&
      a.repoFileTreePaneSizes === b.repoFileTreePaneSizes &&
      a.defaultFileTreePaneSizes === b.defaultFileTreePaneSizes &&
      a.setExplorerTab === b.setExplorerTab &&
      a.setRepoFileTreePaneSize === b.setRepoFileTreePaneSize &&
      a.changeCount === b.changeCount,
  )
  const handleTabChange = useCallback((tab: ExplorerTab) => setExplorerTab(repoId, tab), [repoId, setExplorerTab])
  const fileTreeSize = repoFileTreePaneSizes?.[layout] ?? defaultFileTreePaneSizes[layout]
  const activeRevealRequest = revealRequest?.repoId === repoId ? revealRequest : null
  const isPlainWorkspace = useReposStore((s) => {
    const repo = s.repos[repoId]
    return repoIsPlainWorkspace(repo)
  })
  const workspaceRootId = useReposStore(activeWorkspaceRootId)

  const compact = useIsCompactUi()
  const desktopFileAreaCollapsed = !compact && fileAreaCollapsed
  const handleWorktreeDoubleClick = useCallback(() => {
    if (compact) {
      onShowCompactFiles?.()
      return
    }
    onToggleFileArea?.()
  }, [compact, onShowCompactFiles, onToggleFileArea])

  if (isPlainWorkspace) {
    return (
      <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PlainWorkspacePane
          repoId={repoId}
          layout={layout}
          revealRequest={activeRevealRequest}
          terminalPanel={plainWorkspaceTerminalPanel}
          fileAreaCollapsed={desktopFileAreaCollapsed}
          onToggleFileArea={compact ? undefined : onToggleFileArea}
          onOpenFileArea={onOpenFileArea}
          onCollapseFileArea={onCollapseFileArea}
          compactSurface={compactSurface}
          onShowCompactDetail={compact ? onShowCompactDetail : undefined}
          onShowCompactFiles={compact ? onShowCompactFiles : undefined}
          terminalFocusMode={terminalFocusMode}
          onMaximizeTerminal={onMaximizeTerminal}
          onExitTerminalFocus={onExitTerminalFocus}
          onFileAreaItemDoubleClick={handleWorktreeDoubleClick}
        />
      </div>
    )
  }

  if (compact) {
    const surface = compactSurface ?? 'scope'
    return (
      <div
        data-file-tree-layout={layout}
        data-compact-surface={surface}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <SidebarProjectHeader
          repoId={repoId}
          onShowCompactDetail={onShowCompactDetail}
          onShowCompactFiles={onShowCompactFiles}
          onFileAreaItemDoubleClick={handleWorktreeDoubleClick}
          onOpenFileArea={onOpenFileArea}
        />
        {surface === 'scope' ? (
          <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
            <BranchArea
              repoId={repoId}
              showActions={showActions}
              onBranchSelected={onBranchSelected}
              onWorktreeDoubleClick={handleWorktreeDoubleClick}
              onOpenFileArea={onOpenFileArea}
            />
          </div>
        ) : (
          <RepoWorktreeExplorer
            repoId={repoId}
            layout={layout}
            activeTab={activeTab}
            changeCount={changeCount}
            revealRequest={activeRevealRequest}
            onTabChange={handleTabChange}
          />
        )}
        <StatusBar repoId={repoId} />
      </div>
    )
  }

  return (
    <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SidebarProjectHeader
        repoId={repoId}
        onMaximizeTerminal={onMaximizeTerminal}
        onFileAreaItemDoubleClick={handleWorktreeDoubleClick}
        onOpenFileArea={onOpenFileArea}
      />
      <FileAreaSplitPane
        orientation="vertical"
        navigationArea={
          <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
            {workspaceRootId && (
              <WorkspaceRepositoryRail
                workspaceRootId={workspaceRootId}
                currentRepoId={repoId}
                onOpenFileArea={onOpenFileArea}
                onCollapseFileArea={onCollapseFileArea}
                onToggleFileArea={handleWorktreeDoubleClick}
              />
            )}
            <BranchSectionLabel repoId={repoId} />
            <BranchArea
              repoId={repoId}
              showActions={showActions}
              onBranchSelected={onBranchSelected}
              onWorktreeDoubleClick={handleWorktreeDoubleClick}
              onOpenFileArea={onOpenFileArea}
            />
          </div>
        }
        fileArea={
          <RepoWorktreeExplorer
            repoId={repoId}
            layout={layout}
            activeTab={activeTab}
            changeCount={changeCount}
            revealRequest={activeRevealRequest}
            onTabChange={handleTabChange}
          />
        }
        fileAreaSize={fileTreeSize}
        fileAreaCollapsed={desktopFileAreaCollapsed}
        onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
        navigationMinSize="8rem"
        fileAreaMinSize="8rem"
        fileAreaMaxSize="80%"
        className="min-h-0 flex-1"
      />
      <StatusBar repoId={repoId} fileAreaCollapsed={desktopFileAreaCollapsed} onToggleFileArea={onToggleFileArea} />
    </div>
  )
}

// Slim eyebrow above the branch rows — the same 10px tracked-caps label
// the project switcher and detached-worktrees lists use, so the sidebar
// sections read as one system.
function BranchSectionLabel({ repoId }: { repoId: string }) {
  const t = useT()
  const repo = useReposStore((state) => state.repos[repoId])
  const branch = repo?.ui.selectedBranch
    ? (repo.data.branches.find((candidate) => candidate.name === repo.ui.selectedBranch) ?? null)
    : null
  const syncBusy = !!repo && (repo.operations.manualRefresh.phase !== 'idle' || repo.operations.fetch.phase !== 'idle')
  const syncDisabled = !repo || repo.availability.phase === 'unavailable' || syncBusy
  const syncTitle = t(repo?.remote.hasRemotes === false ? 'action.fetch-local-title' : 'action.fetch-title')

  function handleSync() {
    if (!repo || syncDisabled) return
    void runRepoRefreshIntent(useReposStore.getState, {
      kind: 'manual-refresh-requested',
      id: repo.id,
      token: repo.instanceToken,
    })
  }

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 px-4 pt-1 text-[length:var(--goblin-project-titlebar-font-size)] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
      <span className="min-w-0 flex-1">{t('branches.filter.worktrees')}</span>
      {repo && branch ? (
        <BranchCreateWorktreeButton repo={repo} branch={branch} />
      ) : (
        <Tip label={t('action.create-worktree-title')}>
          <span className="inline-flex">
            <AsyncButton
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label={t('action.create-worktree-title')}
            >
              <FolderPlus aria-hidden="true" />
            </AsyncButton>
          </span>
        </Tip>
      )}
      <Tip label={syncTitle}>
        <span className="inline-flex">
          <AsyncButton
            type="button"
            variant="ghost"
            size="icon-sm"
            loading={syncBusy}
            disabled={syncDisabled}
            aria-label={t('action.refresh')}
            onClick={handleSync}
          >
            {({ busy }) => <RefreshCw className={busy ? 'animate-spin' : ''} aria-hidden="true" />}
          </AsyncButton>
        </span>
      </Tip>
    </div>
  )
}

function BranchCreateWorktreeButton({ repo, branch }: { repo: BranchActionRepo; branch: RepoBranchState }) {
  const actions = useBranchActionItems(repo, branch)
  const action = actions.mainItems.find((item) => item.id === 'createWorktree')
  const t = useT()
  if (!action) return null

  return (
    <>
      <Tip label={action.title ?? action.label}>
        <span className="inline-flex">
          <AsyncButton
            type="button"
            variant="ghost"
            size="icon-sm"
            loading={action.busy}
            disabled={action.disabled}
            aria-label={action.ariaLabel ?? action.title ?? t('action.create-worktree-title')}
            onClick={() => action.onSelect()}
          >
            <FolderPlus aria-hidden="true" />
          </AsyncButton>
        </span>
      </Tip>
      {actions.dialogs}
    </>
  )
}

function BranchArea({
  repoId,
  showActions,
  onBranchSelected,
  onWorktreeDoubleClick,
  onOpenFileArea,
}: {
  repoId: string
  showActions: boolean
  onBranchSelected?: () => void
  onWorktreeDoubleClick?: () => void
  onOpenFileArea?: () => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <BranchList
        repoId={repoId}
        showActions={showActions}
        onBranchSelected={onBranchSelected}
        onWorktreeDoubleClick={onWorktreeDoubleClick}
        onOpenFileArea={onOpenFileArea}
      />
    </section>
  )
}
