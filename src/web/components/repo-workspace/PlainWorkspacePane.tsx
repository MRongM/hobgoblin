import { useReposStore } from '#/web/stores/repos/store.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

interface PlainWorkspacePaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  revealRequest?: FileTreeRevealRequest | null
}

export function PlainWorkspacePane({ repoId, layout, revealRequest }: PlainWorkspacePaneProps) {
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
          <ProjectFileTree repoId={repoId} revealRequest={revealRequest ?? null} toolbarHeight="detail" />
        </RepoWorkspacePane>
      }
      detailPane={
        <RepoWorkspacePane>
          <PlainWorkspaceTerminalPanel repoId={repoId} />
        </RepoWorkspacePane>
      }
    />
  )
}
