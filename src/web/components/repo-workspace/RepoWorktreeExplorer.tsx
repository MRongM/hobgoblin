import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  FolderGit,
  FolderTree,
  GitBranch,
  GitCompareArrows,
  GitFork,
  History,
  RadioTower,
  type LucideIcon,
} from 'lucide-react'
import { isRemoteRepoId, localRepoSessionEntry, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
import { RepoExplorerPanel } from '#/web/components/repo-workspace/RepoExplorerPanel.tsx'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { cn } from '#/web/lib/cn.ts'
import { useDetachFileArea } from '#/web/hooks/useDetachFileArea.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { ExplorerTab, RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

export interface FileTreeRevealRequest {
  id: number
  repoId: string
  relativePath: string
}

interface RepoWorktreeExplorerProps {
  repoId: string
  layout: RepoWorkspaceLayout
  activeTab: ExplorerTab
  changeCount: number
  revealRequest: FileTreeRevealRequest | null
  onTabChange: (tab: ExplorerTab) => void
  toolbarLeading?: ReactNode
}

let lastOverflowExpanded = false

export function resetExplorerOverflowExpanded() {
  lastOverflowExpanded = false
}

export function RepoWorktreeExplorer({
  repoId,
  activeTab,
  changeCount,
  revealRequest: externalRevealRequest,
  onTabChange,
  toolbarLeading,
}: RepoWorktreeExplorerProps) {
  const t = useT()
  const [revealRequest, setRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const activeRevealRequest = revealRequest?.repoId === repoId ? revealRequest : null
  const isRemoteRepo = isRemoteRepoId(repoId)
  const activeVisibleTab = activeTab === 'ports' && !isRemoteRepo ? 'files' : activeTab
  const repo = useReposStore((state) => state.repos[repoId])
  const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch)
  const hasWorktree = !!selected?.worktree?.path
  const sessionEntry = repo?.remote.target ? remoteRepoSessionEntry(repo.remote.target) : localRepoSessionEntry(repoId)
  const detach = useDetachFileArea(
    {
      kind: 'git-worktree',
      repo: sessionEntry,
      branch: repo?.ui.selectedBranch ?? '',
      tab: activeVisibleTab,
    },
    { enabled: !!repo?.ui.selectedBranch },
  )

  const baseTabs = [
    { id: 'files' as const, label: t('file-tree.title'), icon: FolderTree },
    { id: 'changes' as const, label: t('tab.changes'), icon: GitCompareArrows },
    { id: 'status' as const, label: t('tab.status'), icon: GitBranch },
    { id: 'history' as const, label: t('tab.history'), icon: History },
    { id: 'local' as const, label: t('tab.local'), icon: FolderGit },
    { id: 'remoteBranches' as const, label: t('tab.remote-branches'), icon: GitFork },
  ]
  const orderedTabs = hasWorktree ? [baseTabs[2], baseTabs[0], baseTabs[1], ...baseTabs.slice(3)] : baseTabs
  const tabs = [
    ...orderedTabs,
    ...(isRemoteRepo ? [{ id: 'ports' as const, label: t('ports.title'), icon: RadioTower }] : []),
  ] satisfies { id: ExplorerTab; label: string; icon: LucideIcon }[]
  const primaryTabs = tabs.slice(0, 3)
  const overflowTabs = tabs.slice(3)
  const [overflowExpanded, setOverflowExpanded] = useState(() => lastOverflowExpanded)
  const toggleOverflow = () =>
    setOverflowExpanded((current) => {
      lastOverflowExpanded = !current
      return !current
    })

  const renderTab = (tab: (typeof tabs)[number]) => {
    const selected = activeVisibleTab === tab.id
    const Icon = tab.icon
    return (
      <Button
        key={tab.id}
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={selected}
        aria-controls={`repo-explorer-${tab.id}-panel`}
        tabIndex={selected ? 0 : -1}
        onClick={() => onTabChange(tab.id)}
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
          <Badge variant="attention" className="font-normal font-mono tabular-nums">
            {changeCount}
          </Badge>
        ) : null}
      </Button>
    )
  }

  function handleRevealPath(relativePath: string) {
    onTabChange('files')
    setRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, repoId, relativePath }))
  }

  useEffect(() => {
    if (!externalRevealRequest) return
    onTabChange('files')
    setRevealRequest(externalRevealRequest)
  }, [externalRevealRequest, onTabChange])

  return (
    <section
      data-repo-worktree-explorer={repoId}
      className="project-file-area-tone flex min-h-0 flex-1 flex-col bg-pane"
    >
      <Toolbar
        data-testid="repo-explorer-toolbar"
        className={cn('border-y-0 px-2', detach.dragging && 'opacity-70 ring-1 ring-ring')}
        variant="detail"
        tabIndex={detach.enabled ? 0 : undefined}
        {...detach.bindings}
      >
        {toolbarLeading}
        <ToolbarTabStrip
          compact={false}
          compactContent={null}
          scrollContent={
            <ToolbarTabStripBody
              scroll
              role="tablist"
              aria-label={t('file-tree.title')}
              aria-orientation="horizontal"
              className="gap-0.5"
            >
              {primaryTabs.map(renderTab)}
              {overflowTabs.length > 0 ? (
                <>
                  {(overflowExpanded ? overflowTabs : overflowTabs.filter((tab) => tab.id === activeVisibleTab)).map(
                    renderTab,
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="explorer-tabs-overflow-toggle"
                    aria-expanded={overflowExpanded}
                    aria-label={t(overflowExpanded ? 'file-tree.tabs.collapse' : 'file-tree.tabs.expand')}
                    onClick={toggleOverflow}
                    className="h-7 border border-separator px-2 text-muted-foreground hover:bg-tab-hover hover:text-foreground"
                  >
                    {overflowExpanded ? (
                      <ChevronsLeft className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronsRight className="size-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </Button>
                </>
              ) : null}
            </ToolbarTabStripBody>
          }
        />
      </Toolbar>
      <div id={`repo-explorer-${activeVisibleTab}-panel`} role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        <RepoExplorerPanel
          repoId={repoId}
          activeTab={activeVisibleTab}
          revealRequest={activeRevealRequest}
          onRevealPath={handleRevealPath}
        />
      </div>
    </section>
  )
}
