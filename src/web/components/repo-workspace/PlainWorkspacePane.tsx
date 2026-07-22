import type { ReactNode } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { FileAreaSplitPane } from '#/web/components/repo-workspace/FileAreaSplitPane.tsx'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import type { CompactWorkspaceSurface } from '#/web/components/repo-workspace/model.ts'

interface PlainWorkspacePaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  revealRequest?: FileTreeRevealRequest | null
  terminalPanel?: ReactNode
  fileAreaCollapsed?: boolean
  onToggleFileArea?: () => void
  onOpenFileArea?: () => void
  compactSurface?: Exclude<CompactWorkspaceSurface, 'detail'>
  onShowCompactDetail?: () => void
  onShowCompactFiles?: () => void
  terminalFocusMode?: boolean
  onMaximizeTerminal?: () => void
  onExitTerminalFocus?: () => void
}

export function PlainWorkspacePane({
  repoId,
  layout,
  revealRequest,
  terminalPanel,
  fileAreaCollapsed = false,
  onToggleFileArea,
  onOpenFileArea,
  compactSurface,
  onShowCompactDetail,
  onShowCompactFiles,
  terminalFocusMode = false,
  onMaximizeTerminal,
  onExitTerminalFocus,
}: PlainWorkspacePaneProps) {
  const compact = useIsCompactUi()
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
  const focusMode = !compact && !repoUnavailable && terminalFocusMode
  const fileBrowser = <ProjectFileTree repoId={repoId} revealRequest={revealRequest ?? null} toolbarHeight="detail" />

  if (compact) {
    const surface = compactSurface ?? (multiRepositoryWorkspace ? 'scope' : 'files')
    return (
      <div data-compact-surface={surface} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarProjectHeader
          repoId={repoId}
          onShowCompactDetail={onShowCompactDetail}
          onShowCompactFiles={onShowCompactFiles}
        />
        <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
          {surface === 'scope' && multiRepositoryWorkspace ? (
            <WorkspaceRepositoryRail
              workspaceRootId={repoId}
              currentRepoId={repoId}
              fill
              onOpenFileArea={onOpenFileArea}
            />
          ) : (
            fileBrowser
          )}
        </div>
        <StatusBar repoId={repoId} />
      </div>
    )
  }

  const detailPane = (
    <RepoWorkspacePane>
      {terminalPanel ?? (
        <PlainWorkspaceTerminalPanel
          repoId={repoId}
          layout={layout}
          focusMode={focusMode}
          onExitTerminalFocus={onExitTerminalFocus}
        />
      )}
    </RepoWorkspacePane>
  )

  const branchPane = (
    <RepoWorkspacePane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarProjectHeader repoId={repoId} onMaximizeTerminal={onMaximizeTerminal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {desktopWorkspaceOverview ? (
            <FileAreaSplitPane
              orientation="vertical"
              navigationArea={
                <div className="project-navigation-tone flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
                  <WorkspaceRepositoryRail
                    workspaceRootId={repoId}
                    currentRepoId={repoId}
                    fill
                    onOpenFileArea={onOpenFileArea}
                  />
                </div>
              }
              fileArea={fileBrowser}
              fileAreaSize={fileAreaSize}
              fileAreaCollapsed={desktopFileAreaCollapsed}
              onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
              navigationMinSize="8rem"
              fileAreaMinSize="8rem"
              fileAreaMaxSize="80%"
              className="min-h-0 flex-1"
            />
          ) : !desktopFileAreaCollapsed ? (
            fileBrowser
          ) : null}
        </div>
        <StatusBar repoId={repoId} fileAreaCollapsed={desktopFileAreaCollapsed} onToggleFileArea={onToggleFileArea} />
      </div>
    </RepoWorkspacePane>
  )

  if (focusMode) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detailPane}</div>
  }

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
