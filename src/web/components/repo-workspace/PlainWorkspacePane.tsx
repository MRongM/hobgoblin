import type { ReactNode } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useIsCompactUi } from '#/web/hooks/useResponsiveUiMode.tsx'

interface PlainWorkspacePaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  revealRequest?: FileTreeRevealRequest | null
  terminalPanel?: ReactNode
}

export function PlainWorkspacePane({ repoId, layout, revealRequest, terminalPanel }: PlainWorkspacePaneProps) {
  const compact = useIsCompactUi()
  const terminalPaneSize = useReposStore((s) => s.detailPaneSizes[layout])
  const setDetailPaneSize = useReposStore((s) => s.setDetailPaneSize)

  return (
    <RepoWorkspace
      layout={layout}
      mode="split"
      detailSize={terminalPaneSize}
      onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
      branchPane={
        <RepoWorkspacePane>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!compact && <SidebarProjectHeader repoId={repoId} />}
            <ProjectFileTree repoId={repoId} revealRequest={revealRequest ?? null} toolbarHeight="detail" />
            {!compact && <StatusBar repoId={repoId} />}
          </div>
        </RepoWorkspacePane>
      }
      detailPane={
        <RepoWorkspacePane>{terminalPanel ?? <PlainWorkspaceTerminalPanel repoId={repoId} />}</RepoWorkspacePane>
      }
    />
  )
}
