// Active-repo body. Split layouts render the branch area plus detail,
// while focus mode renders detail directly under the global topbar.

import { useCallback, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { BranchDetail } from '#/web/components/BranchDetail.tsx'
import { RepoWorkspaceSkeleton } from '#/web/components/Skeleton.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { useRepoToasts } from '#/web/hooks/useRepoToasts.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { repoWorkspaceBehavior } from '#/web/lib/workspace-layout.ts'
import { getRepoWorkspacePresentation } from '#/web/components/repo-workspace/model.ts'
import { RepoExplorerPane, type FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { UnavailableRepoView } from '#/web/components/UnavailableRepoView.tsx'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'

interface Props {
  repoId: string
}

export function RepoView({ repoId }: Props) {
  const t = useT()
  const uiMode = useResponsiveUiMode()
  const view = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const repo = s.repos[repoId]
      const presentation = getRepoWorkspacePresentation(repo)
      const workspaceLayout = repo?.ui.workspaceLayout ?? s.workspaceLayout
      return {
        exists: presentation.exists,
        initialLoading: presentation.initialLoading,
        detailCollapsed: s.detailCollapsed,
        detailFocusMode: s.detailFocusMode,
        workspaceLayout,
        detailPaneSizes: s.detailPaneSizes,
      }
    },
    (a, b) =>
      a.exists === b.exists &&
      a.initialLoading === b.initialLoading &&
      a.detailCollapsed === b.detailCollapsed &&
      a.detailFocusMode === b.detailFocusMode &&
      a.workspaceLayout === b.workspaceLayout &&
      a.detailPaneSizes['top-bottom'] === b.detailPaneSizes['top-bottom'] &&
      a.detailPaneSizes['left-right'] === b.detailPaneSizes['left-right'],
  )
  const setDetailPaneSize = useReposStore((s) => s.setDetailPaneSize)
  const setWorkspaceLayout = useReposStore((s) => s.setWorkspaceLayout)
  const repo = useReposStore((s) => s.repos[repoId])
  useRepoToasts(repoId)
  const [terminalRevealRequest, setTerminalRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const handleTerminalRevealPath = useCallback((relativePath: string) => {
    setTerminalRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, relativePath }))
  }, [])

  const layout = view.workspaceLayout
  const behavior = repoWorkspaceBehavior(layout, view.detailCollapsed, view.detailFocusMode)
  const detailPaneSize = view.detailPaneSizes[layout]
  const compactLeftRight = uiMode === 'compact' && view.workspaceLayout === 'left-right'
  const isPlainWorkspace = repoIsPlainWorkspace(repo)

  if (!view.exists || !repo) return <div />
  if (repo.availability.phase === 'unavailable') return <UnavailableRepoView repo={repo} />
  if (view.initialLoading) {
    return (
      <RepoWorkspaceSkeleton
        layout={layout}
        detailCollapsed={behavior.detailCollapsed}
        detailFocusMode={behavior.detailFocusMode}
        compact={uiMode === 'compact'}
      />
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
          />
        </RepoWorkspacePane>
      </section>
    )
  }

  const detailPane = (
    <RepoWorkspacePane>
      <BranchDetail
        repoId={repoId}
        layout={layout}
        collapsed={behavior.detailCollapsed}
        detailFocusMode={behavior.detailFocusMode}
        onRevealPath={handleTerminalRevealPath}
      />
    </RepoWorkspacePane>
  )
  const workspaceMode = behavior.mode === 'collapsed' ? 'collapsed' : 'split'

  const workspaceBody =
    behavior.mode === 'focus' ? (
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
              showActions={behavior.branchListActionsVisible}
              revealRequest={terminalRevealRequest}
            />
          </RepoWorkspacePane>
        }
        detailPane={detailPane}
      />
    )

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {compactLeftRight && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 p-6 text-center">
          <Smartphone className="mb-4 h-10 w-10 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">{t('workspace.compact-mask.title')}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t('workspace.compact-mask.description')}</div>
          <Button className="mt-4" onClick={() => setWorkspaceLayout(repoId, 'top-bottom')}>
            {t('workspace.compact-mask.button')}
          </Button>
        </div>
      )}
      {workspaceBody}
    </section>
  )
}
