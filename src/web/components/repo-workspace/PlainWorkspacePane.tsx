import type { ReactNode } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'

interface PlainWorkspacePaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  revealRequest?: FileTreeRevealRequest | null
  terminalPanel?: ReactNode
  fileAreaCollapsed?: boolean
  onToggleFileArea?: () => void
  onShowCompactDetail?: () => void
}

export function PlainWorkspacePane({
  repoId,
  layout,
  revealRequest,
  terminalPanel,
  fileAreaCollapsed = false,
  onToggleFileArea,
  onShowCompactDetail,
}: PlainWorkspacePaneProps) {
  const compact = useIsCompactUi()
  const detailFocusMode = useReposStore((state) => state.detailFocusMode)
  const repoUnavailable = useReposStore((state) => state.repos[repoId]?.availability.phase === 'unavailable')
  const multiRepositoryWorkspace = useReposStore((state) => !!state.workspaceProjects[repoId])
  const terminalPaneSize = useReposStore((s) => s.detailPaneSizes[layout])
  const setDetailPaneSize = useReposStore((s) => s.setDetailPaneSize)
  const fileAreaSize = useReposStore(
    (state) => state.repos[repoId]?.ui.fileTreePaneSizes?.[layout] ?? state.fileTreePaneSizes[layout],
  )
  const setRepoFileTreePaneSize = useReposStore((state) => state.setRepoFileTreePaneSize)
  const desktopFileAreaCollapsed = !compact && fileAreaCollapsed
  const desktopWorkspaceOverview = !compact && multiRepositoryWorkspace
  const splitOrientation = layout === 'top-bottom' ? 'horizontal' : 'vertical'
  const sideBySide = splitOrientation === 'horizontal'
  const behavior = repoWorkspaceBehavior(layout, false, detailFocusMode)
  const focusMode = !compact && !repoUnavailable && behavior.mode === 'focus'

  if (compact && multiRepositoryWorkspace && onShowCompactDetail) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarProjectHeader repoId={repoId} onShowCompactDetail={onShowCompactDetail} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
          <WorkspaceRepositoryRail workspaceRootId={repoId} currentRepoId={repoId} fill />
        </div>
        <StatusBar repoId={repoId} />
      </div>
    )
  }

  const fileBrowser = <ProjectFileTree repoId={repoId} revealRequest={revealRequest ?? null} toolbarHeight="detail" />
  const detailPane = (
    <RepoWorkspacePane>
      {terminalPanel ?? <PlainWorkspaceTerminalPanel repoId={repoId} layout={layout} focusMode={focusMode} />}
    </RepoWorkspacePane>
  )

  if (focusMode) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detailPane}</div>
  }

  const branchPane = (
    <RepoWorkspacePane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!compact && <SidebarProjectHeader repoId={repoId} />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {desktopWorkspaceOverview ? (
            <SplitPane
              orientation={splitOrientation}
              before={
                <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
                  <WorkspaceRepositoryRail workspaceRootId={repoId} currentRepoId={repoId} fill />
                </div>
              }
              after={fileBrowser}
              afterSize={fileAreaSize}
              afterCollapsed={desktopFileAreaCollapsed}
              onAfterSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
              beforeMinSize={sideBySide ? '12rem' : '8rem'}
              afterMinSize={sideBySide ? '12rem' : '8rem'}
              afterMaxSize="80%"
              className="min-h-0 flex-1"
            />
          ) : !desktopFileAreaCollapsed ? (
            fileBrowser
          ) : null}
        </div>
        {!compact && (
          <StatusBar repoId={repoId} fileAreaCollapsed={desktopFileAreaCollapsed} onToggleFileArea={onToggleFileArea} />
        )}
      </div>
    </RepoWorkspacePane>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <RepoWorkspace
        layout={layout}
        mode="split"
        detailSize={terminalPaneSize}
        onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
        branchPane={branchPane}
        detailPane={detailPane}
      />
    </div>
  )
}
