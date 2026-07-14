import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  FolderTree,
  FolderGit,
  GitBranch,
  GitCompareArrows,
  GitFork,
  History,
  RadioTower,
  Tag,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { BranchList } from '#/web/components/BranchList.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'
import { ProjectLocalPanel } from '#/web/components/repo-workspace/ProjectLocalPanel.tsx'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'
import { PlainWorkspacePane } from '#/web/components/repo-workspace/PlainWorkspacePane.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import type { ExplorerTab, RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'

export interface FileTreeRevealRequest {
  id: number
  repoId: string
  relativePath: string
}

interface RepoExplorerPaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  showActions: boolean
  revealRequest?: FileTreeRevealRequest | null
}

export function RepoExplorerPane({ repoId, layout, showActions, revealRequest }: RepoExplorerPaneProps) {
  const {
    activeTab,
    repoFileTreePaneSizes,
    defaultFileTreePaneSizes,
    setExplorerTab,
    setRepoFileTreePaneSize,
    changeCount,
  } = useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
      const worktreePath = selected?.worktree?.path
      return {
        activeTab: repo ? explorerTabForRepo(repo) : 'files',
        repoFileTreePaneSizes: repo?.ui.fileTreePaneSizes,
        defaultFileTreePaneSizes: state.fileTreePaneSizes,
        setExplorerTab: state.setExplorerTab,
        setRepoFileTreePaneSize: state.setRepoFileTreePaneSize,
        changeCount: worktreePath
          ? (repo?.data.status.find((status) => status.path === worktreePath)?.entries.length ?? 0)
          : 0,
      }
    },
    (a, b) =>
      a.activeTab === b.activeTab &&
      a.repoFileTreePaneSizes === b.repoFileTreePaneSizes &&
      a.defaultFileTreePaneSizes === b.defaultFileTreePaneSizes &&
      a.setExplorerTab === b.setExplorerTab &&
      a.setRepoFileTreePaneSize === b.setRepoFileTreePaneSize &&
      a.changeCount === b.changeCount,
  )
  const handleTabChange = useCallback((tab: ExplorerTab) => setExplorerTab(repoId, tab), [repoId, setExplorerTab])
  const fileTreeSize = repoFileTreePaneSizes?.[layout] ?? defaultFileTreePaneSizes[layout]
  const splitOrientation = layout === 'top-bottom' ? 'horizontal' : 'vertical'
  const sideBySide = splitOrientation === 'horizontal'
  const activeRevealRequest = revealRequest?.repoId === repoId ? revealRequest : null
  const isPlainWorkspace = useReposStore((s) => {
    const repo = s.repos[repoId]
    return repoIsPlainWorkspace(repo)
  })

  if (isPlainWorkspace) {
    return (
      <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1">
        <PlainWorkspacePane repoId={repoId} layout={layout} revealRequest={activeRevealRequest} />
      </div>
    )
  }

  return (
    <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1">
      <SplitPane
        orientation={splitOrientation}
        before={<BranchArea repoId={repoId} showActions={showActions} />}
        after={
          <ExplorerTabs
            repoId={repoId}
            layout={layout}
            activeTab={activeTab}
            changeCount={changeCount}
            revealRequest={activeRevealRequest}
            onTabChange={handleTabChange}
          />
        }
        afterSize={fileTreeSize}
        onAfterSizeChange={(size) => setRepoFileTreePaneSize(repoId, layout, size)}
        beforeMinSize={sideBySide ? '12rem' : '8rem'}
        afterMinSize={sideBySide ? '12rem' : '8rem'}
        afterMaxSize="80%"
        className="flex-1"
      />
    </div>
  )
}

function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}

function ExplorerTabs({
  repoId,
  layout,
  activeTab,
  changeCount,
  revealRequest: externalRevealRequest,
  onTabChange,
}: {
  repoId: string
  layout: RepoWorkspaceLayout
  activeTab: ExplorerTab
  changeCount: number
  revealRequest: FileTreeRevealRequest | null
  onTabChange: (tab: ExplorerTab) => void
}) {
  const t = useT()
  const { fileTreeTopbarFontSize } = useRuntimeFontSettings()
  const [revealRequest, setRevealRequest] = useState<FileTreeRevealRequest | null>(null)
  const activeRevealRequest = revealRequest?.repoId === repoId ? revealRequest : null
  const isRemoteRepo = isRemoteRepoId(repoId)
  const activeVisibleTab = activeTab === 'ports' && !isRemoteRepo ? 'files' : activeTab

  // 检查是否有工作树
  const hasWorktree = useReposStore((s) => {
    const repo = s.repos[repoId]
    const selected = repo?.data.branches.find(branch => branch.name === repo.ui.selectedBranch)
    return !!selected?.worktree?.path
  })

  const toolbarStyle = {
    '--goblin-file-tree-topbar-font-size': `${fileTreeTopbarFontSize}px`,
  } as CSSProperties

  // 基础 tab 列表
  const baseTabs = [
    { id: 'files' as const, label: t('file-tree.title'), icon: FolderTree },
    { id: 'changes' as const, label: t('tab.changes'), icon: GitCompareArrows },
    { id: 'status' as const, label: t('tab.status'), icon: GitBranch },
    { id: 'history' as const, label: t('tab.history'), icon: History },
    { id: 'local' as const, label: t('tab.local'), icon: FolderGit },
    { id: 'remoteBranches' as const, label: t('tab.remote-branches'), icon: GitFork },
  ]

  // 有工作树时，status 移到第一位
  const orderedTabs = hasWorktree
    ? [baseTabs[2], baseTabs[0], baseTabs[1], ...baseTabs.slice(3)]
    : baseTabs

  const tabs = [
    ...orderedTabs,
    ...(isRemoteRepo ? [{ id: 'ports' as const, label: t('ports.title'), icon: RadioTower }] : []),
  ] satisfies { id: ExplorerTab; label: string; icon: LucideIcon }[]

  const primaryTabs = tabs.slice(0, 4)
  const overflowTabs = tabs.slice(4)
  const overflowActive = overflowTabs.some((tab) => tab.id === activeVisibleTab)

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
    <section className="flex min-h-0 flex-1 flex-col border-t border-separator/70 bg-pane">
      <Toolbar data-testid="repo-explorer-toolbar" className="px-2" variant="detail" style={toolbarStyle}>
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
              {primaryTabs.map((tab) => {
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
                      'h-7 gap-1.5 border px-2.5 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
                      selected
                        ? 'border-transparent bg-tab-active text-foreground'
                        : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {tab.label}
                    {tab.id === 'changes' && changeCount > 0 && (
                      <Badge variant="attention" className="font-normal font-mono tabular-nums">
                        {changeCount}
                      </Badge>
                    )}
                  </Button>
                )
              })}
              {overflowTabs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      role="tab"
                      aria-selected={overflowActive}
                      tabIndex={overflowActive ? 0 : -1}
                      className={cn(
                        'h-7 gap-1 border px-2 text-[length:var(--goblin-file-tree-topbar-font-size)] font-normal',
                        overflowActive
                          ? 'border-transparent bg-tab-active text-foreground'
                          : 'border-separator text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                      )}
                    >
                      {overflowActive &&
                        (() => {
                          const active = overflowTabs.find((t) => t.id === activeVisibleTab)
                          if (!active) return null
                          const Icon = active.icon
                          return (
                            <>
                              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                              {active.label}
                            </>
                          )
                        })()}
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {overflowTabs.map((tab) => {
                      const Icon = tab.icon
                      return (
                        <DropdownMenuItem
                          key={tab.id}
                          onSelect={() => onTabChange(tab.id)}
                          className={cn(activeVisibleTab === tab.id && 'bg-tab-active text-foreground')}
                        >
                          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                          {tab.label}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ToolbarTabStripBody>
          }
        />
      </Toolbar>
      <div id={`repo-explorer-${activeVisibleTab}-panel`} role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {activeVisibleTab === 'files' ? (
          <ProjectFileTree repoId={repoId} revealRequest={activeRevealRequest} toolbarHeight="detail" />
        ) : activeVisibleTab === 'changes' ? (
          <ProjectChangesPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'status' ? (
          <ProjectStatusPanel repoId={repoId} layout={layout} />
        ) : activeVisibleTab === 'history' ? (
          <ProjectHistoryPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'local' ? (
          <ProjectLocalPanel repoId={repoId} />
        ) : activeVisibleTab === 'remoteBranches' ? (
          <ProjectRemoteBranchesPanel repoId={repoId} />
        ) : (
          <ProjectPortsPanel repoId={repoId} />
        )}
      </div>
    </section>
  )
}
