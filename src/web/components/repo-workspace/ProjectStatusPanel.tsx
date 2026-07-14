import { useStoreWithEqualityFn } from 'zustand/traditional'
import { EmptyState, ScrollPane, Toolbar } from '#/web/components/Layout.tsx'
import { CopyButton } from '#/web/components/CopyButton.tsx'
import { BranchStatus, branchStatusClipboardText } from '#/web/components/branch-detail/BranchStatus.tsx'
import type { BranchDetailRepo } from '#/web/components/branch-detail/model.ts'
import { getSelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'

interface ProjectStatusPanelProps {
  repoId: string
  layout: RepoWorkspaceLayout
}

type ProjectStatusRepo = BranchDetailRepo & {
  name: string
}

function projectStatusRepoEqual(a: ProjectStatusRepo | undefined, b: ProjectStatusRepo | undefined): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.id === b.id &&
      a.name === b.name &&
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

export function ProjectStatusPanel({ repoId, layout }: ProjectStatusPanelProps) {
  const t = useT()
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      return repo
        ? {
            id: repo.id,
            name: repo.name,
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
    projectStatusRepoEqual,
  )

  if (!repo) return null

  const detail = getSelectedBranchDetailPresentation(repo)
  if (!detail.branch) {
    return <EmptyState title={t(repo.data.branches.length === 0 ? 'branches.empty' : 'branches.filter-empty')} />
  }

  const copyAllValue = branchStatusClipboardText(detail, repo.name, repo.id, t)

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <ProjectStatusToolbar copyAllValue={copyAllValue} />
      <ScrollPane>
        <BranchStatus detail={detail} repoName={repo.name} repoId={repo.id} layout={layout} />
      </ScrollPane>
    </section>
  )
}

function ProjectStatusToolbar({ copyAllValue }: { copyAllValue: string }) {
  const t = useT()

  return (
    <Toolbar data-testid="project-status-toolbar" className="gap-2 px-2">
      <div data-testid="project-status-left-actions" className="flex min-w-0 items-center gap-1">
        <CopyButton
          value={copyAllValue}
          copyLabel={t('branch-status.copy-all')}
          copiedLabel={t('branch-status.copied')}
          disabled={!copyAllValue}
          className="shrink-0"
        />
      </div>
    </Toolbar>
  )
}
