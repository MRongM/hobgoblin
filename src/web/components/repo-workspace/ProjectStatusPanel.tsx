import { useStoreWithEqualityFn } from 'zustand/traditional'
import { FolderGit2, FolderOpen, GitCommitHorizontal, GitCompareArrows } from 'lucide-react'
import { EmptyState, ScrollPane, Toolbar } from '#/web/components/Layout.tsx'
import { CopyButton } from '#/web/components/CopyButton.tsx'
import { BranchStatus, branchStatusClipboardText } from '#/web/components/branch-detail/BranchStatus.tsx'
import type { BranchDetailRepo } from '#/web/components/branch-detail/model.ts'
import {
  getBranchDetailPresentation,
  getSelectedBranchDetailPresentation,
  type BranchDetailTarget,
} from '#/web/components/branch-detail/model.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { selectedRepoWorktree } from '#/web/stores/repos/worktree-selection.ts'
import { MonoValue, StatusChip, StatusRow, StatusRows } from '#/web/components/branch-detail/status-ui.tsx'
import type { RepoWorktreeState } from '#/web/stores/repos/types.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'

interface ProjectStatusPanelProps {
  repoId: string
  target?: BranchDetailTarget
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
      a.ui.selectedDetachedWorktreePath === b.ui.selectedDetachedWorktreePath &&
      a.ui.detailTab === b.ui.detailTab &&
      a.resources.status === b.resources.status &&
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

export function ProjectStatusPanel({ repoId, target }: ProjectStatusPanelProps) {
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
              selectedDetachedWorktreePath: repo.ui.selectedDetachedWorktreePath,
              detailTab: repo.ui.detailTab,
            },
            resources: {
              status: repo.resources.status,
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

  const selectedContext = target ? null : selectedRepoWorktree(repo)
  if (selectedContext?.kind === 'detached') {
    const copyAllValue = detachedStatusClipboardText(selectedContext.worktree, repo.name, t)
    return (
      <section className="flex min-h-0 flex-1 flex-col bg-pane">
        <ProjectStatusToolbar copyAllValue={copyAllValue} />
        <ScrollPane>
          <DetachedWorktreeStatus worktree={selectedContext.worktree} repoName={repo.name} />
        </ScrollPane>
      </section>
    )
  }

  const detail = target ? getBranchDetailPresentation(repo, target) : getSelectedBranchDetailPresentation(repo)
  if (!detail.branch) {
    return <EmptyState title={t(repo.data.branches.length === 0 ? 'branches.empty' : 'branches.filter-empty')} />
  }

  const copyAllValue = branchStatusClipboardText(detail, repo.name, repo.id, t)

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <ProjectStatusToolbar copyAllValue={copyAllValue} />
      <ScrollPane>
        <BranchStatus detail={detail} repoName={repo.name} repoId={repo.id} density="compact" />
      </ScrollPane>
    </section>
  )
}

function detachedStatusClipboardText(
  worktree: RepoWorktreeState,
  repoName: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  return [
    [t('branch-status.signal.folder'), lastPathSegment(worktree.path) || worktree.path],
    [t('branch-status.signal.project'), repoName],
    [t('branch-status.signal.branch'), t('branches.detached-worktree')],
    [t('branch-status.signal.worktree'), worktree.path],
    [t('branch-status.signal.commit-hash'), worktree.head ?? '—'],
  ]
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}

function DetachedWorktreeStatus({ worktree, repoName }: { worktree: RepoWorktreeState; repoName: string }) {
  const t = useT()
  const changeCount = worktree.changeCount ?? 0
  const dirty = worktree.isDirty === true || changeCount > 0
  return (
    <StatusRows density="compact">
      <StatusRow
        icon={<FolderOpen size={14} />}
        label={t('branch-status.signal.folder')}
        value={lastPathSegment(worktree.path) || worktree.path}
        valueLayout="fill"
      />
      <StatusRow
        icon={<FolderGit2 size={14} />}
        label={t('branch-status.signal.project')}
        value={repoName}
        valueLayout="fill"
        tone="brand"
      />
      <StatusRow
        icon={<GitCommitHorizontal size={14} />}
        label={t('branch-status.signal.branch')}
        value={<StatusChip>{t('branches.detached-worktree')}</StatusChip>}
        valueLayout="chips"
      />
      <StatusRow
        icon={<GitCompareArrows size={14} />}
        label={t('branch-status.signal.worktree')}
        value={
          <MonoValue title={worktree.path} truncate>
            {worktree.path}
          </MonoValue>
        }
        after={
          dirty ? (
            <StatusChip tone="attention">{t('branch-status.worktree-dirty', { n: changeCount })}</StatusChip>
          ) : undefined
        }
        valueLayout="fill"
        tone={dirty ? 'attention' : 'brand'}
      />
      <StatusRow
        icon={<GitCommitHorizontal size={14} />}
        label={t('branch-status.signal.commit-hash')}
        value={
          <MonoValue title={worktree.head} truncate>
            {worktree.head ?? '—'}
          </MonoValue>
        }
        valueLayout="fill"
      />
    </StatusRows>
  )
}

function ProjectStatusToolbar({ copyAllValue }: { copyAllValue: string }) {
  const t = useT()

  return (
    <Toolbar data-testid="project-status-toolbar" className="gap-2 border-b-0 border-transparent px-2">
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
