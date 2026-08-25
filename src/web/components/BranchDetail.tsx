import { useId } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import {
  branchDetailRepoEqual,
  getSelectedBranchDetailPresentation,
  type BranchDetailRepo,
  type SelectedBranchDetailPresentation,
} from '#/web/components/branch-detail/model.ts'
import { BranchDetailToolbar } from '#/web/components/branch-detail/BranchDetailToolbar.tsx'
import { BranchDetailContent } from '#/web/components/branch-detail/BranchDetailContent.tsx'
import { DEFAULT_WORKSPACE_LAYOUT } from '#/shared/workspace-layout.ts'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'
import { useBranchActionShortcutRegistry } from '#/web/hooks/useBranchActionShortcutRegistry.ts'
interface Props {
  repoId: string
  layout?: RepoWorkspaceLayout
  collapsed?: boolean
  detailFocusMode?: boolean
  terminalFocusMode?: boolean
  compactFocusPresentation?: boolean
  onRevealPath?: (relativePath: string) => void
  onShowCompactExplorer?: () => void
  onShowTerminal?: () => void
  onExitTerminalFocus?: () => void
}

export function BranchDetail({
  repoId,
  layout = DEFAULT_WORKSPACE_LAYOUT,
  collapsed = false,
  detailFocusMode = false,
  terminalFocusMode = false,
  compactFocusPresentation = false,
  onRevealPath,
  onShowCompactExplorer,
  onShowTerminal,
  onExitTerminalFocus,
}: Props) {
  const detailId = useId()
  const repo = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const repo = s.repos[repoId]
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
    branchDetailRepoEqual,
  )
  if (!repo) return null

  const detail = getSelectedBranchDetailPresentation(repo)
  const contentId = `${detailId}-content`

  const focusMode = detailFocusMode || terminalFocusMode

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-detail">
      {detail.branch && !focusMode ? (
        <BranchShortcutHandler
          key={`${repo.id}:${detail.branch.name}`}
          repo={repo}
          detail={detail}
          branch={detail.branch}
          detailId={detailId}
          contentId={contentId}
          collapsed={collapsed}
          detailFocusMode={detailFocusMode}
          terminalFocusMode={terminalFocusMode}
          compactFocusPresentation={compactFocusPresentation}
          layout={layout}
          onRevealPath={onRevealPath}
          onShowCompactExplorer={onShowCompactExplorer}
          onShowTerminal={onShowTerminal}
          onExitTerminalFocus={onExitTerminalFocus}
        />
      ) : (
        <>
          <BranchDetailToolbar
            repo={repo}
            detail={detail}
            detailId={detailId}
            contentId={contentId}
            collapsed={collapsed}
            detailFocusMode={detailFocusMode}
            terminalFocusMode={terminalFocusMode}
            compactFocusPresentation={compactFocusPresentation}
            layout={layout}
            onShowCompactExplorer={onShowCompactExplorer}
            onShowTerminal={onShowTerminal}
            onExitTerminalFocus={onExitTerminalFocus}
          />
          {!collapsed && (
            <BranchDetailContent
              repo={repo}
              detail={detail}
              detailId={detailId}
              contentId={contentId}
              layout={layout}
              onRevealPath={onRevealPath}
            />
          )}
        </>
      )}
    </section>
  )
}

interface BranchShortcutHandlerProps {
  repo: BranchDetailRepo
  detail: SelectedBranchDetailPresentation
  branch: NonNullable<SelectedBranchDetailPresentation['branch']>
  detailId: string
  contentId: string
  collapsed: boolean
  detailFocusMode: boolean
  terminalFocusMode: boolean
  compactFocusPresentation: boolean
  layout: RepoWorkspaceLayout
  onRevealPath?: (relativePath: string) => void
  onShowCompactExplorer?: () => void
  onShowTerminal?: () => void
  onExitTerminalFocus?: () => void
}

function BranchShortcutHandler({
  repo,
  detail,
  branch,
  detailId,
  contentId,
  collapsed,
  detailFocusMode,
  terminalFocusMode,
  compactFocusPresentation,
  layout,
  onRevealPath,
  onShowCompactExplorer,
  onShowTerminal,
  onExitTerminalFocus,
}: BranchShortcutHandlerProps) {
  const actions = useBranchActionItems(repo, branch)
  useBranchActionShortcutRegistry(actions)

  return (
    <>
      <BranchDetailToolbar
        repo={repo}
        detail={detail}
        detailId={detailId}
        contentId={contentId}
        collapsed={collapsed}
        detailFocusMode={detailFocusMode}
        terminalFocusMode={terminalFocusMode}
        compactFocusPresentation={compactFocusPresentation}
        layout={layout}
        onShowCompactExplorer={onShowCompactExplorer}
        onShowTerminal={onShowTerminal}
        onExitTerminalFocus={onExitTerminalFocus}
      />
      {actions.dialogs}
      {!collapsed && (
        <BranchDetailContent
          repo={repo}
          detail={detail}
          detailId={detailId}
          contentId={contentId}
          layout={layout}
          onRevealPath={onRevealPath}
        />
      )}
    </>
  )
}
