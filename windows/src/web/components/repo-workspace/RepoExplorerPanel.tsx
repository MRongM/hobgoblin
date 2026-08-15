import type { FileAreaTabId } from '#/shared/file-area.ts'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { ProjectLocalPanel } from '#/web/components/repo-workspace/ProjectLocalPanel.tsx'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'

interface RepoExplorerPanelProps {
  repoId: string
  activeTab: FileAreaTabId
  revealRequest: { id: number; relativePath: string } | null
  onRevealPath: (relativePath: string) => void
}

export function RepoExplorerPanel({ repoId, activeTab, revealRequest, onRevealPath }: RepoExplorerPanelProps) {
  if (activeTab === 'files') {
    return <ProjectFileTree repoId={repoId} revealRequest={revealRequest} toolbarHeight="detail" />
  }
  if (activeTab === 'changes') {
    return <ProjectChangesPanel repoId={repoId} onRevealPath={onRevealPath} />
  }
  if (activeTab === 'status') {
    return <ProjectStatusPanel repoId={repoId} />
  }
  if (activeTab === 'history') {
    return <ProjectHistoryPanel repoId={repoId} onRevealPath={onRevealPath} />
  }
  if (activeTab === 'local') {
    return <ProjectLocalPanel repoId={repoId} />
  }
  if (activeTab === 'remoteBranches') {
    return <ProjectRemoteBranchesPanel repoId={repoId} />
  }
  return <ProjectPortsPanel repoId={repoId} />
}
