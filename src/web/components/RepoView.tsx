// Active-repo body. Split layouts render the branch area plus detail,
// while focus mode renders detail directly under the global topbar.

import { useCallback, useEffect, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { BranchDetail } from '#/web/components/BranchDetail.tsx'
import { RepoWorkspaceSkeleton } from '#/web/components/Skeleton.tsx'
import { RepoWorkspace, RepoWorkspacePane } from '#/web/components/Layout.tsx'
import { useRepoToasts } from '#/web/hooks/useRepoToasts.tsx'
import { getRepoWorkspacePresentation, type CompactWorkspaceSurface } from '#/web/components/repo-workspace/model.ts'
import { RepoExplorerPane } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import type { FileTreeRevealRequest } from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { UnavailableRepoView } from '#/web/components/UnavailableRepoView.tsx'
import { useResponsiveUiMode } from '#/web/hooks/useResponsiveUiMode.tsx'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'
import { useEffectiveWorkspaceLayout } from '#/web/lib/effective-workspace-layout.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import { resolveBranchWorkspaceMemberTarget } from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
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
        detailPaneSizes: s.detailPaneSizes,
        branchWorkspaceId:
          s.workspaceActiveContextByRoot[repoId]?.kind === 'branch-workspace'
            ? s.workspaceActiveContextByRoot[repoId].branchWorkspaceId
            : null,
        branchWorkspaceMemberRepositoryName:
          s.workspaceActiveContextByRoot[repoId]?.kind === 'branch-workspace'
            ? (s.workspaceActiveContextByRoot[repoId].memberRepositoryName ?? null)
            : null,
      }
    },
    (a, b) =>
      a.exists === b.exists &&
      a.initialLoading === b.initialLoading &&
      a.branchWorkspaceId === b.branchWorkspaceId &&
      a.branchWorkspaceMemberRepositoryName === b.branchWorkspaceMemberRepositoryName &&
      a.detailPaneSizes['left-right'] === b.detailPaneSizes['left-right'],
  )
  const setDetailPaneSize = useReposStore((s) => s.setDetailPaneSize)
  const setDetailTab = useReposStore((s) => s.setDetailTab)
  const repo = useReposStore((s) => s.repos[repoId])
  const multiRepositoryWorkspace = useReposStore((s) => !!s.workspaceProjects[repoId])
  useRepoToasts(repoId)
  const [fileAreaCollapsed, setFileAreaCollapsed] = useState(false)
  const [desktopTerminalFocusMode, setDesktopTerminalFocusMode] = useState(false)
  const [compactSurface, setCompactSurface] = useState<CompactWorkspaceSurface>('detail')
  const [terminalRevealRequest, setTerminalRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const toggleFileArea = useCallback(() => setFileAreaCollapsed((collapsed) => !collapsed), [])
  const openFileArea = useCallback(() => setFileAreaCollapsed(false), [])
  const maximizeDesktopTerminal = useCallback(() => {
    setDetailTab(repoId, 'terminal')
    setDesktopTerminalFocusMode(true)
  }, [repoId, setDetailTab])
  const showCompactScope = useCallback(() => {
    setTerminalRevealRequest(null)
    setCompactSurface('scope')
  }, [])
  const showCompactFiles = useCallback(() => {
    setTerminalRevealRequest(null)
    setCompactSurface('files')
  }, [])
  const showCompactDetail = useCallback(() => {
    setTerminalRevealRequest(null)
    setCompactSurface('detail')
  }, [])
  const handleTerminalRevealPath = useCallback(
    (relativePath: string) => {
      setFileAreaCollapsed(false)
      setCompactSurface('files')
      setTerminalRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, repoId, relativePath }))
    },
    [repoId],
  )
  useEffect(() => {
    setCompactSurface('detail')
    setTerminalRevealRequest(null)
  }, [repoId])
  useEffect(() => {
    setDesktopTerminalFocusMode(false)
  }, [
    repoId,
    repo?.ui.selectedBranch,
    repo?.availability.phase,
    view.branchWorkspaceId,
    view.branchWorkspaceMemberRepositoryName,
    uiMode,
  ])
  useEffect(() => {
    if (repo?.ui.detailTab !== 'terminal') setDesktopTerminalFocusMode(false)
  }, [repo?.ui.detailTab])

  const detailPaneSize = view.detailPaneSizes[layout]
  const isPlainWorkspace = repoIsPlainWorkspace(repo)

  if (!view.exists || !repo) return <div />
  const repoUnavailable = repo.availability.phase === 'unavailable'
  if (view.initialLoading && !repoUnavailable) {
    return (
      <RepoWorkspaceSkeleton
        layout={layout}
        detailFocusMode={false}
        compact={uiMode === 'compact'}
      />
    )
  }
  if (multiRepositoryWorkspace && view.branchWorkspaceId) {
    return (
      <ActiveBranchWorkspaceView
        rootId={repoId}
        branchWorkspaceId={view.branchWorkspaceId}
        memberRepositoryName={view.branchWorkspaceMemberRepositoryName}
        layout={layout}
        onOpenFileArea={openFileArea}
      />
    )
  }
  if (isPlainWorkspace && uiMode === 'compact' && !repoUnavailable) {
    const compactWorkspaceOpen = compactSurface !== 'detail'
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          {compactWorkspaceOpen ? (
            <RepoExplorerPane
              repoId={repoId}
              layout={layout}
              showActions={false}
              compactSurface={compactSurface}
              onOpenFileArea={openFileArea}
              onShowCompactDetail={showCompactDetail}
              onShowCompactFiles={showCompactFiles}
            />
          ) : (
            <PlainWorkspaceTerminalPanel
              repoId={repoId}
              layout={layout}
              compactFocusPresentation
              onShowCompactOverview={multiRepositoryWorkspace ? showCompactScope : showCompactFiles}
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
            onOpenFileArea={openFileArea}
            terminalFocusMode={desktopTerminalFocusMode}
            onMaximizeTerminal={maximizeDesktopTerminal}
            onExitTerminalFocus={() => setDesktopTerminalFocusMode(false)}
          />
        </RepoWorkspacePane>
      </section>
    )
  }

  const selectedBranch = repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)
  const terminalFocusMode =
    uiMode !== 'compact' &&
    !repoUnavailable &&
    desktopTerminalFocusMode &&
    repo.ui.detailTab === 'terminal' &&
    !!selectedBranch?.worktree?.path
  const compactDetailAvailable = !!selectedBranch?.worktree?.path
  const effectiveCompactSurface: CompactWorkspaceSurface =
    compactSurface === 'detail' && !compactDetailAvailable ? 'scope' : compactSurface

  if (uiMode === 'compact' && !repoUnavailable) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <RepoWorkspacePane>
          {effectiveCompactSurface !== 'detail' ? (
            <RepoExplorerPane
              repoId={repoId}
              layout={layout}
              showActions
              compactSurface={effectiveCompactSurface}
              revealRequest={terminalRevealRequest}
              fileAreaCollapsed={fileAreaCollapsed}
              onToggleFileArea={toggleFileArea}
              onOpenFileArea={openFileArea}
              onShowCompactDetail={compactDetailAvailable ? showCompactDetail : undefined}
              onShowCompactFiles={showCompactFiles}
              onBranchSelected={showCompactDetail}
            />
          ) : (
            <BranchDetail
              repoId={repoId}
              layout={layout}
              collapsed={false}
              compactFocusPresentation
              onRevealPath={handleTerminalRevealPath}
              onShowCompactExplorer={showCompactScope}
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
          detailFocusMode={terminalFocusMode}
          onRevealPath={handleTerminalRevealPath}
          onExitTerminalFocus={() => setDesktopTerminalFocusMode(false)}
        />
      )}
    </RepoWorkspacePane>
  )
  const workspaceBody = terminalFocusMode ? (
    detailPane
  ) : (
    <RepoWorkspace
      layout={layout}
      mode="split"
      detailSize={detailPaneSize}
      onDetailSizeChange={(size) => setDetailPaneSize(layout, size)}
      branchPane={
        <RepoWorkspacePane>
          <RepoExplorerPane
            repoId={repoId}
            layout={layout}
            showActions
            revealRequest={terminalRevealRequest}
            fileAreaCollapsed={fileAreaCollapsed}
            onToggleFileArea={toggleFileArea}
            onOpenFileArea={openFileArea}
            onMaximizeTerminal={maximizeDesktopTerminal}
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
  memberRepositoryName,
  layout,
  onOpenFileArea,
}: {
  rootId: string
  branchWorkspaceId: string
  memberRepositoryName: string | null
  layout: RepoWorkspaceLayout
  onOpenFileArea: () => void
}) {
  const query = useBranchWorkspaceQuery(rootId)
  const activateWorkspaceOverview = useReposStore((state) => state.activateWorkspaceOverview)
  const activateBranchWorkspace = useReposStore((state) => state.activateBranchWorkspace)
  const workspaceProject = useReposStore((state) => state.workspaceProjects[rootId])
  const repos = useReposStore((state) => state.repos)
  const [fallbackNotice, setFallbackNotice] = useState<{ repositoryName: string; reason: string } | null>(null)
  const workspace = query.data?.ok
    ? query.data.items.find(
        (item) =>
          item.id === branchWorkspaceId &&
          item.available &&
          item.lifecycle !== 'delete-incomplete' &&
          item.operation?.kind !== 'remove',
      )
    : undefined
  const member = memberRepositoryName
    ? workspace?.repositories.find((repository) => repository.repositoryName === memberRepositoryName)
    : undefined
  const memberResolution =
    memberRepositoryName && workspace && workspaceProject
      ? member
        ? resolveBranchWorkspaceMemberTarget({
            member,
            repositoryIds: workspaceProject.repositoryIds,
            candidates: workspaceProject.candidates,
            repos,
          })
        : { ok: false as const, reason: 'workspace.branch-workspace.member-unconfigured' }
      : null
  const memberTarget = memberResolution?.ok ? memberResolution.target : null
  const memberReason = memberResolution && !memberResolution.ok ? memberResolution.reason : null

  useEffect(() => {
    if (query.data?.ok && !workspace) activateWorkspaceOverview(rootId)
  }, [activateWorkspaceOverview, query.data, rootId, workspace])

  useEffect(() => setFallbackNotice(null), [branchWorkspaceId])

  useEffect(() => {
    if (query.isFetching || !query.data?.ok || !workspace || !memberRepositoryName) return
    if (!memberReason) {
      setFallbackNotice(null)
      return
    }
    setFallbackNotice({ repositoryName: memberRepositoryName, reason: memberReason })
    activateBranchWorkspace(rootId, branchWorkspaceId)
  }, [
    activateBranchWorkspace,
    branchWorkspaceId,
    memberReason,
    memberRepositoryName,
    query.data,
    query.isFetching,
    rootId,
    workspace,
  ])

  if (!workspace) return <div className="min-h-0 flex-1" />
  return (
    <BranchWorkspacePane
      rootId={rootId}
      workspace={workspace}
      memberTarget={memberTarget}
      fallbackNotice={fallbackNotice}
      onDismissFallbackNotice={() => setFallbackNotice(null)}
      layout={layout}
      onOpenFileArea={onOpenFileArea}
    />
  )
}
