import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, PanelLeftOpen, PanelRightOpen, X } from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { BranchDetail } from '#/web/components/BranchDetail.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { BranchWorkspaceFileTree } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { branchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import { BranchWorkspaceMemberContext } from '#/web/components/repo-workspace/BranchWorkspaceMemberContext.tsx'
import { BranchWorkspaceTerminalPanel } from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import { FileAreaSplitPane } from '#/web/components/repo-workspace/FileAreaSplitPane.tsx'
import {
  RepoWorktreeExplorer,
  type FileTreeRevealRequest,
} from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import type { BranchWorkspaceMemberTarget } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { ExplorerTab, RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import type { CompactWorkspaceSurface } from '#/web/components/repo-workspace/model.ts'

interface BranchWorkspacePaneProps {
  rootId: string
  workspace: BranchWorkspaceSnapshot
  memberTarget?: BranchWorkspaceMemberTarget | null
  fallbackNotice?: { repositoryName: string; reason: string } | null
  onDismissFallbackNotice?: () => void
  layout: RepoWorkspaceLayout
  onOpenFileArea?: () => void
  onCollapseFileArea?: () => void
}

export function BranchWorkspacePane({
  rootId,
  workspace,
  memberTarget = null,
  fallbackNotice = null,
  onDismissFallbackNotice,
  layout,
  onOpenFileArea,
  onCollapseFileArea,
}: BranchWorkspacePaneProps) {
  const t = useT()
  const compact = useIsCompactUi()
  const [fileAreaCollapsed, setFileAreaCollapsed] = useState(true)
  const [compactSurface, setCompactSurface] = useState<CompactWorkspaceSurface>(memberTarget ? 'files' : 'detail')
  const compactNavigationIntent = useRef<CompactWorkspaceSurface | null>(null)
  const [memberRevealRequest, setMemberRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const context = branchWorkspaceFolderContext(rootId, workspace)
  const setExplorerTab = useReposStore((state) => state.setExplorerTab)
  const setDetailTab = useReposStore((state) => state.setDetailTab)
  const detailFocusMode = useReposStore((state) => state.detailFocusMode)
  const setDetailFocusMode = useReposStore((state) => state.setDetailFocusMode)
  const memberRepo = useReposStore((state) => (memberTarget ? state.repos[memberTarget.repositoryId] : undefined))
  const memberActiveTab = memberRepo ? explorerTabForRepo(memberRepo) : 'files'
  const memberChangeCount = memberTarget
    ? (memberRepo?.data.status.find((status) => status.path === memberTarget.worktreePath)?.entries.length ?? 0)
    : 0
  const detailPaneSize = useReposStore((state) => state.detailPaneSizes[layout])
  const setDetailPaneSize = useReposStore((state) => state.setDetailPaneSize)
  const fileAreaRepoId = memberTarget?.repositoryId ?? rootId
  const fileTreeSize = useReposStore(
    (state) => state.repos[fileAreaRepoId]?.ui.fileTreePaneSizes?.[layout] ?? state.fileTreePaneSizes[layout],
  )
  const setRepoFileTreePaneSize = useReposStore((state) => state.setRepoFileTreePaneSize)
  const desktopFileAreaCollapsed = !compact && fileAreaCollapsed
  const memberScope = useMemo(
    () =>
      memberTarget
        ? {
            workspaceRootId: rootId,
            branchWorkspaceId: workspace.id,
            repositoryName: memberTarget.repositoryName,
          }
        : null,
    [memberTarget?.repositoryName, rootId, workspace.id],
  )
  const setMemberExplorerTab = useCallback(
    (tab: ExplorerTab) => {
      if (memberTarget) setExplorerTab(memberTarget.repositoryId, tab)
    },
    [memberTarget?.repositoryId, setExplorerTab],
  )

  useEffect(() => {
    setFileAreaCollapsed(!memberTarget)
    setCompactSurface(compactNavigationIntent.current ?? (memberTarget ? 'files' : 'detail'))
    compactNavigationIntent.current = null
    setMemberRevealRequest(null)
  }, [memberTarget?.repositoryId, memberTarget?.repositoryName, memberTarget?.worktreePath, workspace.id])

  useEffect(() => {
    if (!compact && memberTarget && detailFocusMode && memberRepo?.ui.detailTab !== 'terminal') {
      setDetailTab(memberTarget.repositoryId, 'terminal')
    }
  }, [compact, detailFocusMode, memberRepo?.ui.detailTab, memberTarget, setDetailTab])

  const showCompactSurface = (surface: CompactWorkspaceSurface) => {
    compactNavigationIntent.current = surface
    setCompactSurface(surface)
  }

  const openFileArea = () => {
    setFileAreaCollapsed(false)
    onOpenFileArea?.()
  }
  const collapseFileArea = useCallback(() => {
    setFileAreaCollapsed(true)
    onCollapseFileArea?.()
  }, [onCollapseFileArea])
  const toggleFileAreaFromWorkspaceItem = () => {
    if (compact) {
      showCompactSurface('files')
      return
    }
    setFileAreaCollapsed((collapsed) => !collapsed)
  }
  const maximizeTerminalFromExplorer = () => {
    if (memberTarget) setDetailTab(memberTarget.repositoryId, 'terminal')
    setDetailFocusMode(true)
  }
  const revealMemberPath = (relativePath: string) => {
    if (!memberTarget) return
    setExplorerTab(memberTarget.repositoryId, 'files')
    setMemberRevealRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      repoId: memberTarget.repositoryId,
      relativePath,
    }))
    showCompactSurface('files')
    openFileArea()
  }

  const compactToolbarLeading =
    compact && compactSurface === 'files' ? (
      <Fragment>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-testid="show-scope"
          aria-label={t('workspace.branch-workspace.scope-list')}
          title={t('workspace.branch-workspace.scope-list')}
          onClick={() => showCompactSurface('scope')}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-testid="show-detail"
          aria-label={t('mobile.show-terminal')}
          title={t('mobile.show-terminal')}
          onClick={() => showCompactSurface('detail')}
        >
          <PanelRightOpen aria-hidden="true" />
        </Button>
      </Fragment>
    ) : undefined
  const compactScopeButton = compact ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-testid="show-scope"
      aria-label={t('workspace.branch-workspace.scope-list')}
      title={t('workspace.branch-workspace.scope-list')}
      onClick={() => showCompactSurface('scope')}
    >
      <PanelLeftOpen aria-hidden="true" />
    </Button>
  ) : undefined

  const memberExplorer = memberTarget ? (
    <RepoWorktreeExplorer
      repoId={memberTarget.repositoryId}
      layout={layout}
      activeTab={memberActiveTab}
      changeCount={memberChangeCount}
      revealRequest={memberRevealRequest}
      onTabChange={setMemberExplorerTab}
      toolbarLeading={compactToolbarLeading}
    />
  ) : null
  const fileArea = memberExplorer ?? (
    <BranchWorkspaceFileTree context={context} toolbarLeading={compactToolbarLeading} />
  )

  const desktopExplorer = (
    <RepoWorkspacePane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
        <SidebarProjectHeader
          repoId={memberTarget?.repositoryId ?? rootId}
          onMaximizeTerminal={maximizeTerminalFromExplorer}
          onFileAreaItemDoubleClick={toggleFileAreaFromWorkspaceItem}
        />
        <FileAreaSplitPane
          orientation="vertical"
          navigationArea={
            <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
              <WorkspaceRepositoryRail
                workspaceRootId={rootId}
                currentRepoId={rootId}
                fill
                onOpenFileArea={openFileArea}
                onCollapseFileArea={collapseFileArea}
                onToggleFileArea={toggleFileAreaFromWorkspaceItem}
              />
            </div>
          }
          fileArea={fileArea}
          fileAreaSize={fileTreeSize}
          fileAreaCollapsed={desktopFileAreaCollapsed}
          onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(fileAreaRepoId, layout, size)}
          navigationMinSize="8rem"
          fileAreaMinSize="8rem"
          fileAreaMaxSize="80%"
          className="min-h-0 flex-1"
        />
        <StatusBar
          repoId={memberTarget?.repositoryId ?? rootId}
          fileAreaCollapsed={desktopFileAreaCollapsed}
          onToggleFileArea={() => setFileAreaCollapsed((collapsed) => !collapsed)}
        />
      </div>
    </RepoWorkspacePane>
  )
  const detail = (
    <RepoWorkspacePane>
      {memberTarget ? (
        <BranchDetail
          repoId={memberTarget.repositoryId}
          layout={layout}
          compactFocusPresentation={compact}
          terminalFocusMode={!compact && detailFocusMode}
          onRevealPath={revealMemberPath}
          onShowCompactExplorer={compact ? () => showCompactSurface('scope') : undefined}
          onShowTerminal={() => setDetailTab(memberTarget.repositoryId, 'terminal')}
          onExitTerminalFocus={compact ? undefined : () => setDetailFocusMode(false)}
        />
      ) : (
        <BranchWorkspaceTerminalPanel
          context={context}
          toolbarLeading={compact ? compactScopeButton : undefined}
          terminalFocusMode={!compact && detailFocusMode}
          onExitTerminalFocus={compact ? undefined : () => setDetailFocusMode(false)}
        />
      )}
    </RepoWorkspacePane>
  )

  const workspaceBody = compact ? (
    compactSurface === 'scope' ? (
      <RepoWorkspacePane>
        <div className="project-navigation-tone flex min-h-0 flex-1 flex-col bg-sidebar">
          <SidebarProjectHeader
            repoId={memberTarget?.repositoryId ?? rootId}
            onShowCompactDetail={() => showCompactSurface('detail')}
            onShowCompactFiles={() => showCompactSurface('files')}
            onFileAreaItemDoubleClick={toggleFileAreaFromWorkspaceItem}
          />
          <WorkspaceRepositoryRail
            workspaceRootId={rootId}
            currentRepoId={rootId}
            fill
            onOpenFileArea={() => showCompactSurface('files')}
            onCollapseFileArea={collapseFileArea}
            onToggleFileArea={toggleFileAreaFromWorkspaceItem}
            onOpenDetailArea={() => showCompactSurface('detail')}
          />
          <StatusBar repoId={memberTarget?.repositoryId ?? rootId} />
        </div>
      </RepoWorkspacePane>
    ) : compactSurface === 'files' ? (
      <RepoWorkspacePane>
        <div className="flex min-h-0 flex-1 flex-col">
          {fileArea}
          <StatusBar repoId={memberTarget?.repositoryId ?? rootId} />
        </div>
      </RepoWorkspacePane>
    ) : (
      detail
    )
  ) : detailFocusMode ? (
    detail
  ) : (
    <RepoWorkspace
      layout={layout}
      mode="split"
      detailSize={detailPaneSize}
      onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
      branchPane={desktopExplorer}
      detailPane={detail}
    />
  )

  return (
    <BranchWorkspaceMemberContext.Provider value={memberScope}>
      <section className="relative flex min-w-0 flex-1 flex-col" data-branch-workspace-id={workspace.id}>
        {fallbackNotice ? (
          <div
            role="status"
            className="flex items-start gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            <span className="min-w-0 flex-1">
              {t('workspace.branch-workspace.member-fallback', { name: fallbackNotice.repositoryName })}{' '}
              {t(fallbackNotice.reason)}
            </span>
            {onDismissFallbackNotice ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('repo-tabs.close')}
                onClick={onDismissFallbackNotice}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
        {workspaceBody}
      </section>
    </BranchWorkspaceMemberContext.Provider>
  )
}
