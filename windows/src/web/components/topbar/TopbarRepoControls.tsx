import { ChevronDown, GitBranch } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Button } from '#/web/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { BranchActionControls } from '#/web/components/BranchActionControls.tsx'
import { RepoActivityControl } from '#/web/components/repo-activity/RepoActivityControl.tsx'
import { useMainWindowNavigation } from '#/web/main-window-navigation.tsx'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'
import { useBranchActionShortcutRegistry } from '#/web/hooks/useBranchActionShortcutRegistry.ts'
import { visibleBranches } from '#/web/stores/repos/branch-view-mode.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'

interface Props {
  repoId: string
  focusPresentation?: boolean
  tone?: 'topbar' | 'toolbar'
  /** Which trigger edge the focus-mode dropdowns align to; 'start' when the
   *  controls sit at the window's left edge (detail toolbar chrome). */
  menuAlign?: 'start' | 'end'
}

export function TopbarRepoControls({ repoId, focusPresentation, tone = 'topbar', menuAlign = 'end' }: Props) {
  const exists = useReposStore((s) => !!s.repos[repoId])
  const isGitRepo = useReposStore((s) => s.repos[repoId]?.isGitRepo ?? true)
  const focusMode = focusPresentation ?? false
  const mutedForegroundClassName =
    tone === 'toolbar' ? 'text-muted-foreground' : 'text-topbar-muted-foreground'

  if (!exists) return null
  // The project theme menu moved to the bottom status bar; without it this
  // control only has content for focus mode (branch switcher) and non-git
  // workspaces (activity), so render nothing otherwise.
  if (!(isGitRepo && focusMode) && isGitRepo) return null

  return (
    <div className="flex h-full shrink-0 items-center gap-1">
      {isGitRepo && focusMode && <FocusBranchControls repoId={repoId} menuAlign={menuAlign} tone={tone} />}
      {!isGitRepo && (
        <RepoActivityControl repoId={repoId} compact mutedForegroundClassName={mutedForegroundClassName} />
      )}
    </div>
  )
}

function FocusBranchControls({
  repoId,
  menuAlign,
  tone,
}: {
  repoId: string
  menuAlign: 'start' | 'end'
  tone: 'topbar' | 'toolbar'
}) {
  const navigation = useMainWindowNavigation()
  const { branches, selectedBranch, selectedBranchData } = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const repo = s.repos[repoId]
      return {
        branches: repo
          ? visibleBranches({
              branches: repo.data.branches,
              viewMode: 'worktrees',
            })
          : [],
        selectedBranch: repo?.ui.selectedBranch ?? null,
        selectedBranchData: repo?.ui.selectedBranch
          ? (repo.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null)
          : null,
      }
    },
    (a, b) =>
      a.branches === b.branches &&
      a.selectedBranch === b.selectedBranch &&
      a.selectedBranchData === b.selectedBranchData,
  )

  return (
    <div className="flex h-full shrink-0 items-center gap-1">
      <BranchSelector
        repoId={repoId}
        branches={branches}
        selectedBranch={selectedBranch}
        navigation={navigation}
        menuAlign={menuAlign}
        tone={tone}
      />
      {selectedBranchData && <FocusBranchActions repoId={repoId} branch={selectedBranchData} />}
    </div>
  )
}

const FOCUS_BRANCH_ACTIONS_REPO_EQUAL = (a: BranchActionRepo | undefined, b: BranchActionRepo | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.id === b.id &&
    a.instanceToken === b.instanceToken &&
    a.data.currentBranch === b.data.currentBranch &&
    a.data.status === b.data.status &&
    a.data.worktreesByPath === b.data.worktreesByPath &&
    a.operations.branchAction === b.operations.branchAction &&
    a.operations.fetch === b.operations.fetch &&
    a.operations.manualRefresh === b.operations.manualRefresh &&
    a.remote.hasRemotes === b.remote.hasRemotes &&
    a.remote.hasBrowserRemote === b.remote.hasBrowserRemote &&
    a.remote.hasGitHubRemote === b.remote.hasGitHubRemote &&
    a.remote.target === b.remote.target &&
    a.remote.browserRemoteProvider === b.remote.browserRemoteProvider &&
    a.remote.remoteProviders === b.remote.remoteProviders)

function FocusBranchActions({ repoId, branch }: { repoId: string; branch: RepoBranchState }) {
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (s): BranchActionRepo | undefined => {
      const repoState = s.repos[repoId]
      if (!repoState) return undefined
      return {
        id: repoState.id,
        instanceToken: repoState.instanceToken,
        data: {
          currentBranch: repoState.data.currentBranch,
          status: repoState.data.status,
          worktreesByPath: repoState.data.worktreesByPath,
        },
        operations: {
          branchAction: repoState.operations.branchAction,
          fetch: repoState.operations.fetch,
          manualRefresh: repoState.operations.manualRefresh,
        },
        remote: {
          hasRemotes: repoState.remote.hasRemotes,
          hasBrowserRemote: repoState.remote.hasBrowserRemote,
          hasGitHubRemote: repoState.remote.hasGitHubRemote,
          target: repoState.remote.target,
          browserRemoteProvider: repoState.remote.browserRemoteProvider,
          remoteProviders: repoState.remote.remoteProviders,
        },
      }
    },
    FOCUS_BRANCH_ACTIONS_REPO_EQUAL,
  )

  const actions = useBranchActionItems(repo!, branch)
  useBranchActionShortcutRegistry(actions)

  if (!repo) return null

  return (
    <>
      {actions.dialogs}
      <BranchActionControls actions={actions} variant="menu" hideQuickAction repoId={repoId} branchName={branch.name} />
    </>
  )
}

function BranchSelector({
  repoId,
  branches,
  selectedBranch,
  navigation,
  menuAlign,
  tone,
}: {
  repoId: string
  branches: { name: string }[]
  selectedBranch: string | null
  navigation: ReturnType<typeof useMainWindowNavigation>
  menuAlign: 'start' | 'end'
  tone: 'topbar' | 'toolbar'
}) {
  const t = useT()
  if (branches.length === 0) return null
  const index = branches.findIndex((branch) => branch.name === selectedBranch)
  const current = index >= 0 ? index + 1 : 1
  const currentBranch = branches[current - 1]?.name ?? selectedBranch ?? ''
  const title = currentBranch
    ? `${t('branches.switch')}: ${currentBranch} (${current} / ${branches.length})`
    : t('branches.switch')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-0.5 px-1.5 ${
            tone === 'toolbar' ? 'text-muted-foreground' : 'text-topbar-muted-foreground'
          }`}
          aria-label={t('branches.switch')}
          title={title}
        >
          <GitBranch />
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align={menuAlign} className="w-max">
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.name}
            className="whitespace-nowrap"
            disabled={branch.name === selectedBranch}
            onSelect={() => navigation.selectRepoBranch(repoId, branch.name)}
          >
            <span className={branch.name === selectedBranch ? 'text-muted-foreground' : undefined}>{branch.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
