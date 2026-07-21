import { useEffect, useState } from 'react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { BranchWorkspaceFileTree } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { branchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import { BranchWorkspaceTerminalPanel } from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import { FileAreaSplitPane } from '#/web/components/repo-workspace/FileAreaSplitPane.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

interface BranchWorkspacePaneProps {
  rootId: string
  workspace: BranchWorkspaceSnapshot
  layout: RepoWorkspaceLayout
}

export function BranchWorkspacePane({ rootId, workspace, layout }: BranchWorkspacePaneProps) {
  const compact = useIsCompactUi()
  const [fileAreaCollapsed, setFileAreaCollapsed] = useState(true)
  const context = branchWorkspaceFolderContext(rootId, workspace)
  const detailPaneSize = useReposStore((state) => state.detailPaneSizes[layout])
  const setDetailPaneSize = useReposStore((state) => state.setDetailPaneSize)
  const fileTreeSize = useReposStore(
    (state) => state.repos[rootId]?.ui.fileTreePaneSizes?.[layout] ?? state.fileTreePaneSizes[layout],
  )
  const setRepoFileTreePaneSize = useReposStore((state) => state.setRepoFileTreePaneSize)
  const splitOrientation = compact ? 'vertical' : layout === 'top-bottom' ? 'horizontal' : 'vertical'
  const sideBySide = splitOrientation === 'horizontal'
  const desktopFileAreaCollapsed = !compact && fileAreaCollapsed

  useEffect(() => setFileAreaCollapsed(true), [workspace.id])

  const explorer = (
    <RepoWorkspacePane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
        <SidebarProjectHeader repoId={rootId} />
        <FileAreaSplitPane
          orientation={splitOrientation}
          navigationArea={
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar">
              <WorkspaceRepositoryRail workspaceRootId={rootId} currentRepoId={rootId} fill />
            </div>
          }
          fileArea={<BranchWorkspaceFileTree context={context} />}
          fileAreaSize={fileTreeSize}
          fileAreaCollapsed={desktopFileAreaCollapsed}
          onFileAreaSizeChange={(size) => setRepoFileTreePaneSize(rootId, layout, size)}
          navigationMinSize={sideBySide ? '12rem' : '8rem'}
          fileAreaMinSize={sideBySide ? '12rem' : '8rem'}
          fileAreaMaxSize="80%"
          className="min-h-0 flex-1"
        />
        <StatusBar
          repoId={rootId}
          fileAreaCollapsed={compact ? undefined : desktopFileAreaCollapsed}
          onToggleFileArea={compact ? undefined : () => setFileAreaCollapsed((collapsed) => !collapsed)}
        />
      </div>
    </RepoWorkspacePane>
  )
  const terminal = (
    <RepoWorkspacePane>
      <BranchWorkspaceTerminalPanel context={context} />
    </RepoWorkspacePane>
  )

  return (
    <section className="relative flex min-w-0 flex-1 flex-col" data-branch-workspace-id={workspace.id}>
      <RepoWorkspace
        layout={layout}
        mode="split"
        detailSize={detailPaneSize}
        onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
        branchPane={explorer}
        detailPane={terminal}
      />
    </section>
  )
}
