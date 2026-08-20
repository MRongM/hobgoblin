import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  FolderGit,
  FolderTree,
  GitBranch,
  GitCompareArrows,
  GitFork,
  History,
} from 'lucide-react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { localRepoSessionEntry, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
import { BranchWorkspaceAggregatePanel } from '#/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx'
import {
  branchWorkspaceFileAreaTotalChangeCount,
  resolveBranchWorkspaceFileAreaMembers,
} from '#/web/components/repo-workspace/branch-workspace-file-area-members.ts'
import { BranchWorkspaceFileTree } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import type { BranchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useDetachFileArea } from '#/web/hooks/useDetachFileArea.ts'

export type BranchWorkspaceFileAreaTab = 'status' | 'files' | 'changes' | 'history' | 'local' | 'remoteBranches'

export function BranchWorkspaceFileArea({
  workspace,
  context,
  activeTab,
  onTabChange,
  onRevealPath,
  revealRequest,
  toolbarLeading,
  showToolbar = true,
}: {
  workspace: BranchWorkspaceSnapshot
  context: BranchWorkspaceFolderContext
  activeTab: BranchWorkspaceFileAreaTab
  onTabChange: (tab: BranchWorkspaceFileAreaTab) => void
  onRevealPath?: (relativePath: string) => void
  revealRequest?: { id: number; relativePath: string } | null
  toolbarLeading?: ReactNode
  showToolbar?: boolean
}) {
  const t = useT()
  const remoteTarget = useReposStore((state) => state.repos[context.rootId]?.remote.target)
  const project = useReposStore((state) => state.workspaceProjects[workspace.rootId])
  const repos = useReposStore((state) => state.repos)
  const fileAreaMembers = useMemo(
    () => resolveBranchWorkspaceFileAreaMembers({ workspace, project, repos }),
    [project, repos, workspace],
  )
  const totalChangeCount = branchWorkspaceFileAreaTotalChangeCount(fileAreaMembers)
  const root = remoteTarget ? remoteRepoSessionEntry(remoteTarget) : localRepoSessionEntry(context.rootId)
  const detach = useDetachFileArea(
    {
      kind: 'branch-workspace',
      root,
      branchWorkspaceId: workspace.id,
      tab: activeTab,
    },
    { enabled: showToolbar },
  )
  const [overflowExpanded, setOverflowExpanded] = useState(false)
  const firstRepositoryName = workspace.repositories[0]?.repositoryName ?? null
  const [aggregateSelection, setAggregateSelection] = useState<{
    workspaceId: string
    repositoryName: string | null
  }>(() => ({ workspaceId: workspace.id, repositoryName: firstRepositoryName }))
  const requestedRepositoryName =
    aggregateSelection.workspaceId === workspace.id ? aggregateSelection.repositoryName : null
  const selectedAggregateRepositoryName =
    requestedRepositoryName &&
    workspace.repositories.some((member) => member.repositoryName === requestedRepositoryName)
      ? requestedRepositoryName
      : firstRepositoryName

  useEffect(() => {
    if (
      aggregateSelection.workspaceId === workspace.id &&
      aggregateSelection.repositoryName === selectedAggregateRepositoryName
    ) {
      return
    }
    setAggregateSelection({ workspaceId: workspace.id, repositoryName: selectedAggregateRepositoryName })
  }, [aggregateSelection, selectedAggregateRepositoryName, workspace.id])

  const tabs = [
    { id: 'status' as const, label: t('tab.status'), icon: GitBranch },
    { id: 'files' as const, label: t('file-tree.title'), icon: FolderTree },
    { id: 'changes' as const, label: t('tab.changes'), icon: GitCompareArrows },
    { id: 'history' as const, label: t('tab.history'), icon: History },
    { id: 'local' as const, label: t('tab.local'), icon: FolderGit },
    { id: 'remoteBranches' as const, label: t('tab.remote-branches'), icon: GitFork },
  ]
  const primaryTabs = tabs.slice(0, 3)
  const overflowTabs = tabs.slice(3)

  const renderTab = (tab: (typeof tabs)[number]) => {
    return (
      <BranchWorkspaceFileAreaTabButton
        key={tab.id}
        tab={tab}
        selected={tab.id === activeTab}
        changeCount={tab.id === 'changes' ? totalChangeCount : 0}
        onSelect={() => onTabChange(tab.id)}
      />
    )
  }

  return (
    <section
      data-branch-workspace-file-area={workspace.id}
      className="project-file-area-tone flex min-h-0 flex-1 flex-col overflow-hidden bg-pane"
    >
      {showToolbar ? (
        <Toolbar
          data-testid="branch-workspace-file-area-toolbar"
          className={cn('gap-0.5 border-y-0 px-2', detach.dragging && 'opacity-70 ring-1 ring-ring')}
          variant="detail"
          tabIndex={detach.enabled ? 0 : undefined}
          {...detach.bindings}
        >
          {toolbarLeading}
          <div role="tablist" aria-label={t('file-tree.title')} className="flex min-w-0 items-center gap-0.5">
            {primaryTabs.map(renderTab)}
            {(overflowExpanded ? overflowTabs : overflowTabs.filter((tab) => tab.id === activeTab)).map(renderTab)}
            <Button
              type="button"
              variant="ghost"
              data-testid="branch-workspace-tabs-overflow-toggle"
              aria-expanded={overflowExpanded}
              aria-label={t(overflowExpanded ? 'file-tree.tabs.collapse' : 'file-tree.tabs.expand')}
              onClick={() => setOverflowExpanded((expanded) => !expanded)}
              className="h-7 border border-separator px-2 text-muted-foreground hover:bg-tab-hover hover:text-foreground"
            >
              {overflowExpanded ? (
                <ChevronsLeft className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronsRight className="size-3.5 shrink-0" aria-hidden="true" />
              )}
            </Button>
          </div>
        </Toolbar>
      ) : null}
      {activeTab === 'files' ? (
        <BranchWorkspaceFileTree context={context} revealRequest={revealRequest} />
      ) : (
        <BranchWorkspaceAggregatePanel
          workspace={workspace}
          kind={activeTab}
          selectedRepositoryName={selectedAggregateRepositoryName}
          onSelectedRepositoryNameChange={(repositoryName) =>
            setAggregateSelection({ workspaceId: workspace.id, repositoryName })
          }
          onRevealPath={
            activeTab === 'changes' || activeTab === 'history'
              ? (memberName, relativePath) => onRevealPath?.(`${memberName}/${relativePath}`)
              : undefined
          }
        />
      )}
    </section>
  )
}

function BranchWorkspaceFileAreaTabButton({
  tab,
  selected,
  changeCount,
  onSelect,
}: {
  tab: { id: BranchWorkspaceFileAreaTab; label: string; icon: typeof FolderTree }
  selected: boolean
  changeCount: number
  onSelect: () => void
}) {
  const Icon = tab.icon
  return (
    <Button
      type="button"
      variant="ghost"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        'h-7 gap-1 border px-2 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
        selected
          ? 'border-input bg-tab-active text-foreground'
          : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {tab.label}
      {tab.id === 'changes' && changeCount > 0 ? (
        <Badge
          data-testid="branch-workspace-changes-count-badge"
          variant="attention"
          className="font-mono font-normal tabular-nums"
        >
          {changeCount}
        </Badge>
      ) : null}
    </Button>
  )
}
