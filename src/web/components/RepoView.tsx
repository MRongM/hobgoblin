// Active-repo body. Split layouts render the branch area plus detail,
// while focus mode renders detail directly under the global topbar.

import { useCallback, useEffect, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { BranchDetail } from '#/web/components/BranchDetail.tsx'
import { RepoWorkspaceSkeleton } from '#/web/components/Skeleton.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { useRepoToasts } from '#/web/hooks/useRepoToasts.tsx'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'
import { getRepoWorkspacePresentation } from '#/web/components/repo-workspace/model.ts'
import { RepoExplorerPane, type FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { UnavailableRepoView } from '#/web/components/UnavailableRepoView.tsx'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'
import { useEffectiveWorkspaceLayout } from '#/web/lib/effective-workspace-layout.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

interface Props {
  repoId: string
}

export function RepoView({ repoId }: Props) {
  const layout = useEffectiveWorkspaceLayout()
  const uiMode = useResponsiveUiMode()
  const view = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const repo = s.repos[repoId]
      const presentation = getRepoWorkspacePresentation(repo)
      return {
        exists: presentation.exists,
        initialLoading: presentation.initialLoading,
        detailCollapsed: s.detailCollapsed,
        detailFocusMode: s.detailFocusMode,
        detailPaneSizes: s.detailPaneSizes,
        branchWorkspaceId:
          s.workspaceActiveContextByRoot[repoId]?.kind === 'branch-workspace'
            ? s.workspaceActiveContextByRoot[repoId].branchWorkspaceId
            : null,
      }
    },
    (a, b) =>
      a.exists === b.exists &&
      a.initialLoading === b.initialLoading &&
      a.detailCollapsed === b.detailCollapsed &&
      a.detailFocusMode === b.detailFocusMode &&
      a.branchWorkspaceId === b.branchWorkspaceId &&
      a.detailPaneSizes['top-bottom'] === b.detailPaneSizes['top-bottom'] &&
      a.detailPaneSizes['left-right'] === b.detailPaneSizes['left-right'],
  )
  const setDetailPaneSize = useReposStore((s) => s.setDetailPaneSize)
  const repo = useReposStore((s) => s.repos[repoId])
  const multiRepositoryWorkspace = useReposStore((s) => !!s.workspaceProjects[repoId])
  useRepoToasts(repoId)
  const [fileAreaCollapsed, setFileAreaCollapsed] = useState(false)
  const [compactExplorerRepoId, setCompactExplorerRepoId] = useState<string | null>(null)
  const [terminalRevealRequest, setTerminalRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const toggleFileArea = useCallback(() => setFileAreaCollapsed((collapsed) => !collapsed), [])
  const showCompactExplorer = useCallback(() => {
    setTerminalRevealRequest(null)
    setCompactExplorerRepoId(repoId)
  }, [repoId])
  const showCompactDetail = useCallback(() => {
    setTerminalRevealRequest(null)
    setCompactExplorerRepoId(null)
  }, [])
  const handleTerminalRevealPath = useCallback(
    (relativePath: string) => {
      setFileAreaCollapsed(false)
      setCompactExplorerRepoId(repoId)
      setTerminalRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, repoId, relativePath }))
    },
    [repoId],
  )
  useEffect(() => {
    setCompactExplorerRepoId(null)
    setTerminalRevealRequest(null)
  }, [repoId])

  const behavior = repoWorkspaceBehavior(layout, view.detailCollapsed, view.detailFocusMode)
  const detailPaneSize = view.detailPaneSizes[layout]
  const isPlainWorkspace = repoIsPlainWorkspace(repo)

  if (!view.exists || !repo) return <div />
  const repoUnavailable = repo.availability.phase === 'unavailable'
  if (view.initialLoading && !repoUnavailable) {
    return (
      <RepoWorkspaceSkeleton
        layout={layout}
        detailCollapsed={behavior.detailCollapsed}
        detailFocusMode={behavior.detailFocusMode}
        compact={uiMode === 'compact'}
      />
    )
  }
  if (multiRepositoryWorkspace && view.branchWorkspaceId) {
    return <ActiveBranchWorkspaceView rootId={repoId} branchWorkspaceId={view.branchWorkspaceId} layout={layout} />
  }
  if (isPlainWorkspace && uiMode === 'compact' && !repoUnavailable) {
    const compactOverviewOpen = multiRepositoryWorkspace && compactExplorerRepoId === repoId
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          {compactOverviewOpen ? (
            <RepoExplorerPane
              repoId={repoId}
              layout={layout}
              showActions={false}
              onShowCompactDetail={showCompactDetail}
            />
          ) : (
            <PlainWorkspaceTerminalPanel
              repoId={repoId}
              layout={layout}
              compactFocusPresentation
              onShowCompactOverview={multiRepositoryWorkspace ? showCompactExplorer : undefined}
            />
          )}
        </RepoWorkspacePane>
      </section>
    )
  }
  if (isPlainWorkspace) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          <RepoExplorerPane
            repoId={repoId}
            layout={layout}
            showActions={false}
            revealRequest={terminalRevealRequest}
            plainWorkspaceTerminalPanel={repoUnavailable ? <UnavailableRepoView repo={repo} /> : undefined}
            fileAreaCollapsed={fileAreaCollapsed}
            onToggleFileArea={toggleFileArea}
          />
        </RepoWorkspacePane>
      </section>
    )
  }

  const selectedBranch = repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)
  const compactDetailAvailable = !!selectedBranch?.worktree?.path
  const showCompactExplorerPane = compactExplorerRepoId === repoId || !compactDetailAvailable

  if (uiMode === 'compact' && !repoUnavailable) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          {showCompactExplorerPane ? (
            <RepoExplorerPane
              repoId={repoId}
              layout={layout}
              showActions
              revealRequest={terminalRevealRequest}
              fileAreaCollapsed={fileAreaCollapsed}
              onToggleFileArea={toggleFileArea}
              onShowCompactDetail={showCompactDetail}
              onBranchSelected={showCompactDetail}
            />
          ) : (
            <BranchDetail
              repoId={repoId}
              layout={layout}
              collapsed={false}
              detailFocusMode={behavior.detailFocusMode}
              compactFocusPresentation
              onRevealPath={handleTerminalRevealPath}
              onShowCompactExplorer={showCompactExplorer}
            />
          )}
        </RepoWorkspacePane>
      </section>
    )
  }

  const detailPane = (
    <RepoWorkspacePane>
      {repoUnavailable ? (
        <UnavailableRepoView repo={repo} />
      ) : (
        <BranchDetail
          repoId={repoId}
          layout={layout}
          collapsed={behavior.detailCollapsed}
          detailFocusMode={behavior.detailFocusMode}
          onRevealPath={handleTerminalRevealPath}
        />
      )}
    </RepoWorkspacePane>
  )
  const workspaceMode = repoUnavailable ? 'split' : behavior.mode === 'collapsed' ? 'collapsed' : 'split'

  const workspaceBody =
    behavior.mode === 'focus' && !repoUnavailable ? (
      detailPane
    ) : (
      <RepoWorkspace
        layout={layout}
        mode={workspaceMode}
        detailSize={detailPaneSize}
        onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
        branchPane={
          <RepoWorkspacePane>
            <RepoExplorerPane
              repoId={repoId}
              layout={layout}
              showActions={repoUnavailable || behavior.branchListActionsVisible}
              revealRequest={terminalRevealRequest}
              fileAreaCollapsed={fileAreaCollapsed}
              onToggleFileArea={toggleFileArea}
            />
          </RepoWorkspacePane>
        }
        detailPane={detailPane}
      />
    )

  return <section className="relative flex min-w-0 flex-1 flex-col">{workspaceBody}</section>
}

function ActiveBranchWorkspaceView({
  rootId,
  branchWorkspaceId,
  layout,
}: {
  rootId: string
  branchWorkspaceId: string
  layout: RepoWorkspaceLayout
}) {
  const query = useBranchWorkspaceQuery(rootId)
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const workspace = query.data?.ok
    ? query.data.items.find(
        (item) =>
          item.id === branchWorkspaceId &&
          item.available &&
          item.lifecycle !== 'delete-incomplete' &&
          item.operation?.kind !== 'remove',
      )
    : undefined

  useEffect(() => {
    if (query.data?.ok && !workspace) activateWorkspaceOverview(rootId)
  }, [activateWorkspaceOverview, query.data, rootId, workspace])

  if (!workspace) return <div className="min-h-0 flex-1" />
  return <BranchWorkspacePane rootId={rootId} workspace={workspace} layout={layout} />
}
