import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FolderPlus,
  FolderTree,
  FolderGit,
  GitBranch,
  GitCompareArrows,
  GitFork,
  History,
  RadioTower,
  RefreshCw,
  Tag,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react'
import { BranchList } from '#/web/components/BranchList.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'
import { ProjectLocalPanel } from '#/web/components/repo-workspace/ProjectLocalPanel.tsx'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'
import { PlainWorkspacePane } from '#/web/components/repo-workspace/PlainWorkspacePane.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import type { ExplorerTab, RepoBranchState, RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { runRepoRefreshIntent } from '#/web/stores/repos/refresh-coordinator.ts'

export interface FileTreeRevealRequest {
  id: number
  repoId: string
  relativePath: string
}

interface RepoExplorerPaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  showActions: boolean
  revealRequest?: FileTreeRevealRequest | null
  plainWorkspaceTerminalPanel?: ReactNode
  fileAreaCollapsed?: boolean
  onToggleFileArea?: () => void
  onShowCompactDetail?: () => void
  onBranchSelected?: () => void
}

export function RepoExplorerPane({
  repoId,
  layout,
  showActions,
  revealRequest,
  plainWorkspaceTerminalPanel,
  fileAreaCollapsed = false,
  onToggleFileArea,
  onShowCompactDetail,
  onBranchSelected,
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
      const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
      const worktreePath = selected?.worktree?.path
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
  const workspaceRootId = useReposStore((s) => s.repos[repoId]?.workspaceRootId)

  // Compact focus presentation supplies its own explorer navigation, while
  // legacy compact shells keep relying on the global topbar.
  const compact = useIsCompactUi()
  const compactExplorerChrome = compact && !!onShowCompactDetail
  const splitOrientation = compact ? 'vertical' : layout === 'top-bottom' ? 'horizontal' : 'vertical'
  const sideBySide = splitOrientation === 'horizontal'
  const desktopFileAreaCollapsed = !compact && fileAreaCollapsed

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
          onShowCompactDetail={compact ? onShowCompactDetail : undefined}
        />
      </div>
    )
  }

  return (
    <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {(!compact || compactExplorerChrome) && (
        <SidebarProjectHeader repoId={repoId} onShowCompactDetail={compact ? onShowCompactDetail : undefined} />
      )}
      <SplitPane
        orientation={splitOrientation}
        before={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
            {!compact && workspaceRootId && (
              <WorkspaceRepositoryRail workspaceRootId={workspaceRootId} currentRepoId={repoId} />
            )}
            {!compact && <BranchSectionLabel repoId={repoId} />}
            <BranchArea repoId={repoId} showActions={showActions} onBranchSelected={onBranchSelected} />
          </div>
        }
        after={
          <ExplorerTabs
            repoId={repoId}
            layout={layout}
            activeTab={activeTab}
            changeCount={changeCount}
            revealRequest={activeRevealRequest}
            onTabChange={handleTabChange}
          />
        }
        afterSize={fileTreeSize}
        afterCollapsed={desktopFileAreaCollapsed}
        onAfterSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
        beforeMinSize={sideBySide ? '12rem' : '8rem'}
        afterMinSize={sideBySide ? '12rem' : '8rem'}
        afterMaxSize="80%"
        className="min-h-0 flex-1"
      />
      {(!compact || compactExplorerChrome) && (
        <StatusBar
          repoId={repoId}
          fileAreaCollapsed={compact ? undefined : desktopFileAreaCollapsed}
          onToggleFileArea={compact ? undefined : onToggleFileArea}
        />
      )}
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
    <div className="flex h-7 shrink-0 items-center gap-2 px-4 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
      <span className="min-w-0 flex-1">{t('branches.filter.worktrees')}</span>
      {repo && branch ? (
        <BranchCreateWorktreeButton repo={repo} branch={branch} />
      ) : (
        <Tip label={t('action.create-worktree-title')}>
          <span className="inline-flex">
            <AsyncButton
              type="button"
              variant="ghost"
              size="icon-xs"
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
            size="icon-xs"
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
            size="icon-xs"
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
}: {
  repoId: string
  showActions: boolean
  onBranchSelected?: () => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <BranchList repoId={repoId} showActions={showActions} onBranchSelected={onBranchSelected} />
    </section>
  )
}

// Session-only memory for the file-area overflow tab strip: survives
// remounts (project switches) but intentionally resets on page reload.
let lastOverflowExpanded = false

export function resetExplorerOverflowExpanded() {
  lastOverflowExpanded = false
}

function ExplorerTabs({
  repoId,
  layout,
  activeTab,
  changeCount,
  revealRequest: externalRevealRequest,
  onTabChange,
}: {
  repoId: string
  layout: RepoWorkspaceLayout
  activeTab: ExplorerTab
  changeCount: number
  revealRequest: FileTreeRevealRequest | null
  onTabChange: (tab: ExplorerTab) => void
}) {
  const t = useT()
  const [revealRequest, setRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const activeRevealRequest = revealRequest?.repoId === repoId ? revealRequest : null
  const isRemoteRepo = isRemoteRepoId(repoId)
  const activeVisibleTab = activeTab === 'ports' && !isRemoteRepo ? 'files' : activeTab

  // 检查是否有工作树
  const hasWorktree = useReposStore((s) => {
    const repo = s.repos[repoId]
    const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)
    return !!selected?.worktree?.path
  })

  // 基础 tab 列表
  const baseTabs = [
    { id: 'files' as const, label: t('file-tree.title'), icon: FolderTree },
    { id: 'changes' as const, label: t('tab.changes'), icon: GitCompareArrows },
    { id: 'status' as const, label: t('tab.status'), icon: GitBranch },
    { id: 'history' as const, label: t('tab.history'), icon: History },
    { id: 'local' as const, label: t('tab.local'), icon: FolderGit },
    { id: 'remoteBranches' as const, label: t('tab.remote-branches'), icon: GitFork },
  ]

  // 有工作树时，status 移到第一位
  const orderedTabs = hasWorktree ? [baseTabs[2], baseTabs[0], baseTabs[1], ...baseTabs.slice(3)] : baseTabs

  const tabs = [
    ...orderedTabs,
    ...(isRemoteRepo ? [{ id: 'ports' as const, label: t('ports.title'), icon: RadioTower }] : []),
  ] satisfies { id: ExplorerTab; label: string; icon: LucideIcon }[]

  const primaryTabs = tabs.slice(0, 4)
  const overflowTabs = tabs.slice(4)
  const [overflowExpanded, setOverflowExpanded] = useState(() => lastOverflowExpanded)
  const toggleOverflow = () =>
    setOverflowExpanded((current) => {
      lastOverflowExpanded = !current
      return !current
    })

  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = activeVisibleTab === tab.id
    const Icon = tab.icon
    return (
      <Button
        key={tab.id}
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={selected}
        aria-controls={`repo-explorer-${tab.id}-panel`}
        tabIndex={selected ? 0 : -1}
        onClick={() => onTabChange(tab.id)}
        className={cn(
          'h-7 gap-1.5 border px-2.5 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
          selected
            ? 'border-transparent bg-tab-active text-foreground'
            : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {tab.label}
        {tab.id === 'changes' && changeCount > 0 && (
          <Badge variant="attention" className="font-normal font-mono tabular-nums">
            {changeCount}
          </Badge>
        )}
      </Button>
    )
  }

  function handleRevealPath(relativePath: string) {
    onTabChange('files')
    setRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, repoId, relativePath }))
  }

  useEffect(() => {
    if (!externalRevealRequest) return
    onTabChange('files')
    setRevealRequest(externalRevealRequest)
  }, [externalRevealRequest, onTabChange])

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-separator/70 bg-pane">
      <Toolbar data-testid="repo-explorer-toolbar" className="px-2" variant="detail">
        <ToolbarTabStrip
          compact={false}
          compactContent={null}
          scrollContent={
            <ToolbarTabStripBody
              scroll
              role="tablist"
              aria-label={t('file-tree.title')}
              aria-orientation="horizontal"
              className="gap-0.5"
            >
              {primaryTabs.map(renderTab)}
              {overflowTabs.length > 0 && (
                <>
                  {(overflowExpanded ? overflowTabs : overflowTabs.filter((tab) => tab.id === activeVisibleTab)).map(
                    renderTab,
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="explorer-tabs-overflow-toggle"
                    aria-expanded={overflowExpanded}
                    aria-label={t(overflowExpanded ? 'file-tree.tabs.collapse' : 'file-tree.tabs.expand')}
                    onClick={toggleOverflow}
                    className="h-7 border border-separator px-2 text-muted-foreground hover:bg-tab-hover hover:text-foreground"
                  >
                    {overflowExpanded ? (
                      <ChevronsLeft className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronsRight className="size-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </Button>
                </>
              )}
            </ToolbarTabStripBody>
          }
        />
      </Toolbar>
      <div id={`repo-explorer-${activeVisibleTab}-panel`} role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {activeVisibleTab === 'files' ? (
          <ProjectFileTree repoId={repoId} revealRequest={activeRevealRequest} toolbarHeight="detail" />
        ) : activeVisibleTab === 'changes' ? (
          <ProjectChangesPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'status' ? (
          <ProjectStatusPanel repoId={repoId} />
        ) : activeVisibleTab === 'history' ? (
          <ProjectHistoryPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'local' ? (
          <ProjectLocalPanel repoId={repoId} />
        ) : activeVisibleTab === 'remoteBranches' ? (
          <ProjectRemoteBranchesPanel repoId={repoId} />
        ) : (
          <ProjectPortsPanel repoId={repoId} />
        )}
      </div>
    </section>
  )
}
