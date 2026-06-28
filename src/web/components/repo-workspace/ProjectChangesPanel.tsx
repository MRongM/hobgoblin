import { useEffect, useMemo, useState } from 'react'
import { FolderTree, RefreshCw, RotateCcw } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { FileListViewModeControl, type FileListViewMode } from '#/web/components/FileListViewModeControl.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { StatusListSkeleton } from '#/web/components/Skeleton.tsx'
import { StatusList } from '#/web/components/StatusList.tsx'
import { CopyButton } from '#/web/components/CopyButton.tsx'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Switch } from '#/web/components/ui/switch.tsx'
import type { BranchDetailRepo, SelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { getSelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import { discardRepositoryChanges } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resourceBusy } from '#/web/stores/repos/resources.ts'

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

function changedFilePaths(status: SelectedBranchDetailPresentation['selectedStatus']): string[] {
  return status.flatMap((worktree) => worktree.entries.map((entry) => entry.path))
}

function changedFilePathsClipboardText(filePaths: string[]): string {
  return filePaths.join('\n')
}

function changedDirectoryPaths(filePaths: string[]): string[] {
  const directories = new Set<string>()
  for (const filePath of filePaths) {
    const parts = filePath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part
      directories.add(current)
    }
  }
  return Array.from(directories)
}

function isNestedPath(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`)
}

function toggleFileTargetSelection(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected)
  if (next.has(path)) {
    next.delete(path)
    return next
  }
  const parentSelection = Array.from(next).find((target) => isNestedPath(path, target))
  if (parentSelection) {
    next.delete(parentSelection)
    return next
  }
  next.add(path)
  return next
}

function toggleDirectoryTargetSelection(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected)
  if (next.has(path)) {
    next.delete(path)
    return next
  }
  for (const target of next) {
    if (isNestedPath(target, path)) next.delete(target)
  }
  next.add(path)
  return next
}

function discardConfirmTitle(
  t: (key: string) => string,
  selectedTargets: ReadonlySet<string>,
  directoryTargets: ReadonlySet<string>,
): string {
  if (selectedTargets.size === 1) {
    const [target] = Array.from(selectedTargets)
    return target && directoryTargets.has(target)
      ? t('changes.discard-confirm-folder-title')
      : t('changes.discard-confirm-file-title')
  }
  return t('changes.discard-confirm-multiple-title').replace('{count}', String(selectedTargets.size))
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
  const [selectionEnabled, setSelectionEnabled] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(() => new Set())
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
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

  const detail = repo ? getSelectedBranchDetailPresentation(repo) : null
  const selectedStatus = detail?.selectedStatus ?? []
  const currentChangedFiles = useMemo(() => changedFilePaths(selectedStatus), [selectedStatus])
  const currentChangedDirectories = useMemo(() => changedDirectoryPaths(currentChangedFiles), [currentChangedFiles])
  const currentChangedDirectorySet = useMemo(() => new Set(currentChangedDirectories), [currentChangedDirectories])
  const currentSelectableTargets = useMemo(
    () => new Set([...currentChangedFiles, ...currentChangedDirectories]),
    [currentChangedDirectories, currentChangedFiles],
  )

  useEffect(() => {
    setSelectedTargets((current) => {
      const next = new Set(Array.from(current).filter((path) => currentSelectableTargets.has(path)))
      return next.size === current.size ? current : next
    })
  }, [currentSelectableTargets])

  if (!repo) return null

  if (!detail?.branch) {
    return <EmptyState title={t(repo.data.branches.length === 0 ? 'branches.empty' : 'branches.filter-empty')} />
  }

  const hasChanges = detail.selectedStatus.some((worktree) => worktree.entries.length > 0)
  const handleSelectionEnabledChange = (enabled: boolean) => {
    setSelectionEnabled(enabled)
    if (!enabled) setSelectedTargets(new Set())
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <ProjectChangesActionBar
        showFileViewMode={hasChanges}
        fileViewMode={fileViewMode}
        selectionEnabled={selectionEnabled}
        selectedCount={selectedTargets.size}
        statusRefreshing={resourceBusy(repo.resources.status)}
        changedFilePathsValue={changedFilePathsClipboardText(currentChangedFiles)}
        onFileViewModeChange={setFileViewMode}
        onSelectionEnabledChange={handleSelectionEnabledChange}
        onDiscardSelected={() => setConfirmDiscardOpen(true)}
        onRefreshStatus={() => {
          void useReposStore.getState().refreshStatus(repo.id, { token: repo.instanceToken })
        }}
      />
      <ProjectChangesContent
        repo={repo}
        branch={detail.branch}
        selectedStatus={detail.selectedStatus}
        statusLoading={detail.loading.status}
        statusError={detail.errors.status}
        statusStale={detail.stale.status}
        fileViewMode={fileViewMode}
        selectionEnabled={selectionEnabled}
        selectedTargets={selectedTargets}
        onToggleFile={(path) => setSelectedTargets((current) => toggleFileTargetSelection(current, path))}
        onToggleDirectory={(path) => setSelectedTargets((current) => toggleDirectoryTargetSelection(current, path))}
        onRevealPath={onRevealPath}
      />
      <ConfirmDialog
        open={confirmDiscardOpen}
        title={discardConfirmTitle(t, selectedTargets, currentChangedDirectorySet)}
        message={t('changes.discard-confirm-body')}
        confirmLabel={t('changes.discard-confirm-confirm')}
        destructive
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={async () => {
          const worktreePath = detail.branch?.worktree?.path
          if (!worktreePath) return
          const paths = Array.from(selectedTargets)
          const result = await discardRepositoryChanges(repo.id, worktreePath, paths)
          useReposStore.getState().setLastResult(repo.id, result, repo.instanceToken)
          if (result.ok) setSelectedTargets(new Set())
          setConfirmDiscardOpen(false)
        }}
      />
    </section>
  )
}

function ProjectChangesActionBar({
  showFileViewMode,
  fileViewMode,
  selectionEnabled,
  selectedCount,
  statusRefreshing,
  changedFilePathsValue,
  onFileViewModeChange,
  onSelectionEnabledChange,
  onDiscardSelected,
  onRefreshStatus,
}: {
  showFileViewMode: boolean
  fileViewMode: FileListViewMode
  selectionEnabled: boolean
  selectedCount: number
  statusRefreshing: boolean
  changedFilePathsValue: string
  onFileViewModeChange: (mode: FileListViewMode) => void
  onSelectionEnabledChange: (enabled: boolean) => void
  onDiscardSelected: () => void
  onRefreshStatus: () => void
}) {
  const t = useT()

  return (
    <div
      data-testid="project-changes-action-bar"
      className="flex min-h-8 shrink-0 items-center gap-2 border-b border-toolbar-border bg-toolbar px-2"
    >
      <div data-testid="project-changes-left-actions" className="flex min-w-0 items-center gap-1">
        {showFileViewMode && <FileListViewModeControl value={fileViewMode} onChange={onFileViewModeChange} />}
        {showFileViewMode && (
          <CopyButton
            value={changedFilePathsValue}
            copyLabel={t('history.copy-file-paths')}
            copiedLabel={t('branch-status.copied')}
            disabled={!changedFilePathsValue}
            className="shrink-0"
          />
        )}
        <AsyncButton
          type="button"
          size="icon-xs"
          variant="ghost"
          loading={statusRefreshing}
          disabled={statusRefreshing}
          aria-label={t('changes.refresh')}
          title={t('changes.refresh')}
          onClick={onRefreshStatus}
        >
          {({ busy }) => <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />}
        </AsyncButton>
        {showFileViewMode && (
          <label className="flex shrink-0 items-center px-1" title={t('changes.selection-toggle-title')}>
            <Switch
              checked={selectionEnabled}
              onCheckedChange={onSelectionEnabledChange}
              aria-label={t('changes.selection-toggle-title')}
              title={t('changes.selection-toggle-title')}
            />
          </label>
        )}
      </div>
      {selectedCount > 0 && (
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
          <span className="truncate text-xs text-muted-foreground">
            {t('changes.selected-count').replace('{count}', String(selectedCount))}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            aria-label={t('changes.discard-selected')}
            onClick={onDiscardSelected}
          >
            <RotateCcw size={14} />
            {t('changes.discard-selected')}
          </Button>
        </div>
      )}
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
  selectionEnabled,
  selectedTargets,
  onToggleFile,
  onToggleDirectory,
  onRevealPath,
}: {
  repo: Pick<BranchDetailRepo, 'data'>
  branch: ProjectChangesBranch
  selectedStatus: SelectedBranchDetailPresentation['selectedStatus']
  statusLoading: boolean
  statusError: string | null
  statusStale: boolean
  fileViewMode: FileListViewMode
  selectionEnabled: boolean
  selectedTargets: ReadonlySet<string>
  onToggleFile: (path: string) => void
  onToggleDirectory: (path: string) => void
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
          <StatusList
            status={selectedStatus}
            viewMode={fileViewMode}
            selectedTargets={selectionEnabled ? selectedTargets : undefined}
            onToggleFile={selectionEnabled ? onToggleFile : undefined}
            onToggleDirectory={selectionEnabled ? onToggleDirectory : undefined}
            onPathClick={onRevealPath}
          />
        </ScrollPane>
      ) : (
        <StatusList
          status={selectedStatus}
          selectedTargets={selectionEnabled ? selectedTargets : undefined}
          onToggleFile={selectionEnabled ? onToggleFile : undefined}
          onToggleDirectory={selectionEnabled ? onToggleDirectory : undefined}
          onPathClick={onRevealPath}
        />
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
