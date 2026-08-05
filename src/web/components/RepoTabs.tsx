// Top repository tab strip — one compact tab per opened repository. Click
// to focus, hover to reveal the close (×) button. The active tab gets a
// raised surface treatment so it reads as the selected workspace above the
// repository body.
//
// Drag-to-reorder uses dnd-kit (the de-facto choice in the React/shadcn/
// tanstack ecosystem). PointerSensor with a small activation distance lets
// a regular click still focus the repo without triggering a drag; keyboard
// users use Arrow keys for tab activation.
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { RepoTabStrip } from '#/web/components/repo-tabs/RepoTabStrip.tsx'
import { repoTabSummariesEqual } from '#/web/components/repo-tabs/summary-equality.ts'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'
import { openRepoFromDialog } from '#/web/lib/open-repo-dialog.ts'
import { repoTabStoreActionsEqual, repoTabStoreActionsFromStore } from '#/web/stores/repos/selector-actions.ts'
import { activeProjectId } from '#/web/stores/repos/workspace-projects.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

interface RepoTabsProps {
  currentRepoId: string | null
  onOpenRepoPathDialog: () => void
  onOpenRemote: () => void
  onClone: () => void
}

export function RepoTabs({ currentRepoId, onOpenRepoPathDialog, onOpenRemote, onClone }: RepoTabsProps) {
  const t = useT()
  // Build the summary array inside the selector but compare with our
  // explicit equality fn so re-derivations with identical contents
  // don't trigger a re-render. Zustand v5's primary `useReposStore`
  // hook drops the second-arg equality fn — `useStoreWithEqualityFn`
  // from `zustand/traditional` is the v5 escape hatch for cases like
  // this where shallow on Object.is misses the structurally-equal
  // case.
  const summaries = useStoreWithEqualityFn(
    useReposStore,
    (s) =>
      s.order
        .map<RepoTabSummary | null>((id) => {
          const r = s.repos[id]
          return r
            ? {
                id: r.id,
                name: r.name,
                remoteDetails: r.remote.remoteDetails ?? [],
                worktreePaths: repoTerminalWorktreePaths(r),
                remoteTarget: r.remote.target,
                unavailable: r.availability.phase === 'unavailable',
                isGitRepo: r.isGitRepo,
              }
            : null
        })
        .filter((x): x is RepoTabSummary => x !== null),
    repoTabSummariesEqual,
  )
  const navigation = useMainWindowNavigation()
  const currentProjectId = useReposStore((state) => activeProjectId(state) ?? currentRepoId)
  const { ensureWorkspaceOpen, reorderRepos } = useStoreWithEqualityFn(
    useReposStore,
    repoTabStoreActionsFromStore,
    repoTabStoreActionsEqual,
  )

  async function handleOpenLocal() {
    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo: navigation.activateRepo,
      openRepoPathDialog: onOpenRepoPathDialog,
      t,
    })
  }

  return (
    <RepoTabStrip
      repos={summaries}
      activeId={currentProjectId}
      labels={{
        repositories: t('repo-tabs.repos'),
        closeWithName: (name) => t('repo-tabs.close-named', { name }),
        more: t('repo-tabs.more'),
        dragToReorder: t('repo-tabs.drag-to-reorder'),
        open: t('topbar.open'),
        openLocal: t('repo-tabs.open-local'),
        openLocalShortcut: null,
        openRemote: t('repo-tabs.open-remote'),
        openRemoteShortcut: null,
        clone: t('repo-tabs.clone'),
        cloneShortcut: null,
        clearCache: t('error.clear-cache'),
        clearCacheConfirmTitle: t('repo-tabs.clear-cache-confirm-title'),
        clearCacheConfirmMessage: t('repo-tabs.clear-cache-confirm-message'),
        clearCacheConfirmLabel: t('repo-tabs.clear-cache-confirm'),
        unavailable: t('repo-unavailable.title'),
      }}
      onActivate={navigation.activateRepo}
      onClose={navigation.closeRepo}
      onReorder={reorderRepos}
      onOpenLocal={handleOpenLocal}
      onOpenRemote={onOpenRemote}
      onClone={onClone}
    />
  )
}

// Also feeds the sidebar project list's terminal indicators
// (SidebarProjectHeader), so both surfaces agree on which worktrees
// count toward a repo's terminal state.
export function repoTerminalWorktreePaths(repo: {
  id: string
  isGitRepo?: boolean
  remote?: Pick<RepoState['remote'], 'target'>
  data: {
    branches: Array<{ worktree?: { path?: string } }>
    worktreesByPath: Record<string, unknown>
  }
}): string[] {
  if (repo.isGitRepo === false) return [repoPlainWorkspacePath(repo) ?? repo.id]

  return Array.from(
    new Set([
      ...Object.keys(repo.data.worktreesByPath),
      ...repo.data.branches.map((branch) => branch.worktree?.path).filter((path): path is string => !!path),
    ]),
  ).sort()
}
