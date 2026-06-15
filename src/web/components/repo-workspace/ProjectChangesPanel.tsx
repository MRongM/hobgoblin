import { useState } from 'react'
import { FolderTree } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { FileListViewModeControl, type FileListViewMode } from '#/web/components/FileListViewModeControl.tsx'
import { BranchActionControls } from '#/web/components/BranchActionControls.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { StatusListSkeleton } from '#/web/components/Skeleton.tsx'
import { StatusList } from '#/web/components/StatusList.tsx'
import type { BranchActionItemGroups } from '#/web/hooks/useBranchActionItems.ts'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'
import type { BranchDetailRepo, SelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { getSelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

type ProjectChangesBranch = NonNullable<SelectedBranchDetailPresentation['branch']>

function projectChangesRepoEqual(a: BranchDetailRepo | undefined, b: BranchDetailRepo | undefined): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.id === b.id &&
      a.instanceToken === b.instanceToken &&
      a.data.branches === b.data.branches &&
      a.data.currentBranch === b.data.currentBranch &&
      a.data.status === b.data.status &&
      a.data.statusLoaded === b.data.statusLoaded &&
      a.data.worktreesByPath === b.data.worktreesByPath &&
      a.ui.selectedBranch === b.ui.selectedBranch &&
      a.ui.detailTab === b.ui.detailTab &&
      a.resources.status === b.resources.status &&
      a.resources.pullRequests === b.resources.pullRequests &&
      a.operations.branchAction === b.operations.branchAction &&
      a.operations.fetch === b.operations.fetch &&
      a.operations.manualRefresh === b.operations.manualRefresh &&
      a.remote.target === b.remote.target &&
      a.remote.hasRemotes === b.remote.hasRemotes &&
      a.remote.hasBrowserRemote === b.remote.hasBrowserRemote &&
      a.remote.hasGitHubRemote === b.remote.hasGitHubRemote &&
      a.remote.browserRemoteProvider === b.remote.browserRemoteProvider &&
      a.remote.remoteProviders === b.remote.remoteProviders)
  )
}

export function ProjectChangesPanel({
  repoId,
  onRevealPath,
}: {
  repoId: string
  onRevealPath?: (relativePath: string) => void
}) {
  const t = useT()
  const [fileViewMode, setFileViewMode] = useState<FileListViewMode>('tree')
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      return repo
        ? {
            id: repo.id,
            instanceToken: repo.instanceToken,
            data: {
              branches: repo.data.branches,
              currentBranch: repo.data.currentBranch,
              status: repo.data.status,
              statusLoaded: repo.data.statusLoaded,
              worktreesByPath: repo.data.worktreesByPath,
            },
            ui: {
              selectedBranch: repo.ui.selectedBranch,
              detailTab: repo.ui.detailTab,
            },
            resources: {
              status: repo.resources.status,
              pullRequests: repo.resources.pullRequests,
            },
            operations: {
              branchAction: repo.operations.branchAction,
              fetch: repo.operations.fetch,
              manualRefresh: repo.operations.manualRefresh,
            },
            remote: {
              target: repo.remote.target,
              hasRemotes: repo.remote.hasRemotes,
              hasBrowserRemote: repo.remote.hasBrowserRemote,
              hasGitHubRemote: repo.remote.hasGitHubRemote,
              browserRemoteProvider: repo.remote.browserRemoteProvider,
              remoteProviders: repo.remote.remoteProviders,
            },
          }
        : undefined
    },
    projectChangesRepoEqual,
  )

  if (!repo) return null

  const detail = getSelectedBranchDetailPresentation(repo)
  if (!detail.branch) {
    return <EmptyState title={t(repo.data.branches.length === 0 ? 'branches.empty' : 'branches.filter-empty')} />
  }

  const hasChanges = detail.selectedStatus.some((worktree) => worktree.entries.length > 0)

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <ProjectChangesActionBar
        repo={repo}
        branch={detail.branch}
        disableCommit={!hasChanges}
        showFileViewMode={hasChanges}
        fileViewMode={fileViewMode}
        onFileViewModeChange={setFileViewMode}
      />
      <ProjectChangesContent
        repo={repo}
        branch={detail.branch}
        selectedStatus={detail.selectedStatus}
        statusLoading={detail.loading.status}
        statusError={detail.errors.status}
        statusStale={detail.stale.status}
        fileViewMode={fileViewMode}
        onRevealPath={onRevealPath}
      />
    </section>
  )
}

function ProjectChangesActionBar({
  repo,
  branch,
  disableCommit,
  showFileViewMode,
  fileViewMode,
  onFileViewModeChange,
}: {
  repo: BranchDetailRepo
  branch: ProjectChangesBranch
  disableCommit: boolean
  showFileViewMode: boolean
  fileViewMode: FileListViewMode
  onFileViewModeChange: (mode: FileListViewMode) => void
}) {
  const actions = useBranchActionItems(repo, branch)
  const commitItem = actions.mainItems.find((item) => item.id === 'commit' && item.visible)
  if (!commitItem && !showFileViewMode) return <>{actions.dialogs}</>

  const commitActions: BranchActionItemGroups | null = commitItem
    ? {
        patchItems: [],
        mainItems: [{ ...commitItem, disabled: commitItem.disabled || disableCommit }],
        externalItems: [],
        destructiveItems: [],
        dialogs: actions.dialogs,
      }
    : null

  return (
    <div
      data-testid="project-changes-action-bar"
      className="flex min-h-8 shrink-0 items-center justify-end gap-1 border-b border-separator/70 bg-card px-2"
    >
      {commitActions && <BranchActionControls actions={commitActions} variant="bar" />}
      {showFileViewMode && <FileListViewModeControl value={fileViewMode} onChange={onFileViewModeChange} />}
      {actions.dialogs}
    </div>
  )
}

function ProjectChangesContent({
  repo,
  branch,
  selectedStatus,
  statusLoading,
  statusError,
  statusStale,
  fileViewMode,
  onRevealPath,
}: {
  repo: Pick<BranchDetailRepo, 'data'>
  branch: ProjectChangesBranch
  selectedStatus: SelectedBranchDetailPresentation['selectedStatus']
  statusLoading: boolean
  statusError: string | null
  statusStale: boolean
  fileViewMode: FileListViewMode
  onRevealPath?: (relativePath: string) => void
}) {
  const t = useT()
  const totalEntries = selectedStatus.reduce((n, wt) => n + wt.entries.length, 0)

  if (branch.worktree?.path && statusLoading && !repo.data.statusLoaded) return <StatusListSkeleton rows={8} />
  if (branch.worktree?.path && !repo.data.statusLoaded && statusError) return <EmptyState title={t(statusError)} />
  if (!branch.worktree?.path) {
    return (
      <EmptyState
        icon={<FolderTree size={16} />}
        title={t('status.no-worktree-title')}
        body={t('status.no-worktree-body')}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {statusStale && statusError && <StaleStatusNotice message={statusError} />}
      {totalEntries > 0 ? (
        <ScrollPane>
          <StatusList status={selectedStatus} viewMode={fileViewMode} onPathClick={onRevealPath} />
        </ScrollPane>
      ) : (
        <StatusList status={selectedStatus} onPathClick={onRevealPath} />
      )}
    </div>
  )
}

function StaleStatusNotice({ message }: { message: string }) {
  const t = useT()
  return (
    <div className="border-b border-warning-border bg-warning-surface px-4 py-2 text-xs text-warning">
      <span className="font-medium">{t('status.stale-title')}</span>
      <span className="text-muted-foreground"> - {t(message)}</span>
    </div>
  )
}
