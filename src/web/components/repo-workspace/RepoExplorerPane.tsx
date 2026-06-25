import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BranchList } from '#/web/components/BranchList.tsx'
import { SplitPane } from '#/web/components/SplitPane.tsx'
import { ProjectFileTree } from '#/web/components/file-tree/ProjectFileTree.tsx'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'
import { PlainWorkspacePane } from '#/web/components/repo-workspace/PlainWorkspacePane.tsx'
import { BranchFilterControls } from '#/web/components/repo-toolbar/BranchFilterControls.tsx'
import { RepoToolbarActions } from '#/web/components/repo-toolbar/RepoToolbarActions.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'
import { Toolbar } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { cn } from '#/web/lib/cn.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { useRuntimeFontSettings } from '#/web/runtime-settings-fonts.ts'
import { repoIsPlainWorkspace } from '#/web/stores/repos/capabilities.ts'

type ExplorerTab = 'files' | 'changes' | 'status' | 'history' | 'ports'

export interface FileTreeRevealRequest {
  id: number
  relativePath: string
}

interface RepoExplorerPaneProps {
  repoId: string
  layout: RepoWorkspaceLayout
  showActions: boolean
  revealRequest?: FileTreeRevealRequest | null
}

export function RepoExplorerPane({ repoId, layout, showActions, revealRequest }: RepoExplorerPaneProps) {
  const { fileTreePaneSizes, setFileTreePaneSize, changeCount } = useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      const selected = repo?.data.branches.find((branch) => branch.name === repo.ui.selectedBranch) ?? null
      const worktreePath = selected?.worktree?.path
      return {
        fileTreePaneSizes: state.fileTreePaneSizes,
        setFileTreePaneSize: state.setFileTreePaneSize,
        changeCount: worktreePath
          ? (repo?.data.status.find((status) => status.path === worktreePath)?.entries.length ?? 0)
          : 0,
      }
    },
    (a, b) =>
      a.fileTreePaneSizes === b.fileTreePaneSizes &&
      a.setFileTreePaneSize === b.setFileTreePaneSize &&
      a.changeCount === b.changeCount,
  )
  const [activeTab, setActiveTab] = useState<ExplorerTab>('files')
  const fileTreeSize = fileTreePaneSizes[layout]
  const splitOrientation = layout === 'top-bottom' ? 'horizontal' : 'vertical'
  const sideBySide = splitOrientation === 'horizontal'
  const isPlainWorkspace = useReposStore((s) => {
    const repo = s.repos[repoId]
    return repoIsPlainWorkspace(repo)
  })

  if (isPlainWorkspace) {
    return (
      <div data-file-tree-layout={layout} className="flex min-h-0 min-w-0 flex-1">
        <PlainWorkspacePane repoId={repoId} layout={layout} revealRequest={revealRequest ?? null} />
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
            revealRequest={revealRequest ?? null}
            onTabChange={setActiveTab}
          />
        }
        afterSize={fileTreeSize}
        onAfterSizeChange={(size) => setFileTreePaneSize(layout, size)}
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
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls
          repoId={repoId}
          className="h-full min-w-0 flex-1 gap-1"
        />
        <div className="flex shrink-0 items-center gap-1">
          <RepoToolbarActions repoId={repoId} compact />
        </div>
      </Toolbar>
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
  const isRemoteRepo = isRemoteRepoId(repoId)
  const activeVisibleTab = activeTab === 'ports' && !isRemoteRepo ? 'files' : activeTab
  const toolbarStyle = {
    '--goblin-file-tree-topbar-font-size': `${fileTreeTopbarFontSize}px`,
  } as CSSProperties
  const tabs = [
    { id: 'files' as const, label: t('file-tree.title') },
    { id: 'changes' as const, label: t('tab.changes') },
    { id: 'status' as const, label: t('tab.status') },
    { id: 'history' as const, label: t('tab.history') },
    ...(isRemoteRepo ? [{ id: 'ports' as const, label: t('ports.title') }] : []),
  ] satisfies { id: ExplorerTab; label: string }[]

  function handleRevealPath(relativePath: string) {
    onTabChange('files')
    setRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, relativePath }))
  }

  useEffect(() => {
    if (!externalRevealRequest) return
    onTabChange('files')
    setRevealRequest(externalRevealRequest)
  }, [externalRevealRequest, onTabChange])

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-separator/70 bg-background">
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
            >
              {tabs.map((tab) => {
                const selected = activeVisibleTab === tab.id
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
                        ? 'border-transparent bg-selected text-selected-foreground'
                        : 'border-separator text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    {tab.label}
                    {tab.id === 'changes' && changeCount > 0 && (
                      <Badge variant="attention" className="font-normal font-mono tabular-nums">
                        {changeCount}
                      </Badge>
                    )}
                  </Button>
                )
              })}
            </ToolbarTabStripBody>
          }
        />
      </Toolbar>
      <div id={`repo-explorer-${activeVisibleTab}-panel`} role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {activeVisibleTab === 'files' ? (
          <ProjectFileTree repoId={repoId} revealRequest={revealRequest} />
        ) : activeVisibleTab === 'changes' ? (
          <ProjectChangesPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : activeVisibleTab === 'status' ? (
          <ProjectStatusPanel repoId={repoId} layout={layout} />
        ) : activeVisibleTab === 'history' ? (
          <ProjectHistoryPanel repoId={repoId} onRevealPath={handleRevealPath} />
        ) : (
          <ProjectPortsPanel repoId={repoId} />
        )}
      </div>
    </section>
  )
}
