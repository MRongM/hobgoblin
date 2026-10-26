import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react'
import type {
  DetachedBranchWorkspaceFileAreaRequest,
  DetachedFileAreaWindowRequest,
  DetachedGitWorktreeFileAreaRequest,
  DetachedPlainProjectFileAreaRequest,
  FileAreaTabId,
} from '#/shared/file-area.ts'
import { isSshRepoId } from '#/shared/remote-repo.ts'
import { EffectiveProjectThemeBridge } from '#/web/components/EffectiveProjectThemeBridge.tsx'
import { ErrorBoundary } from '#/web/components/ErrorBoundary.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { RepoExplorerPanel } from '#/web/components/repo-workspace/RepoExplorerPanel.tsx'
import {
  BranchWorkspaceFileArea,
  type BranchWorkspaceFileAreaTab,
} from '#/web/components/repo-workspace/BranchWorkspaceFileArea.tsx'
import { branchWorkspaceFolderContext } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import { Topbar } from '#/web/components/Topbar.tsx'
import { Toaster } from '#/web/components/ui/sonner.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { useBranchWorkspaceInvalidationSync, useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { useRepoStoreInvalidationRefresh } from '#/web/hooks/useRepoStoreInvalidationRefresh.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'
import { useSettingsQueryInvalidationSync } from '#/web/settings-queries.ts'
import { useI18nStore, useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import { detachedHeadTerminalLabel, isSelectableDetachedWorktree } from '#/web/stores/repos/worktree-selection.ts'
import { useThemeStore } from '#/web/stores/theme.ts'

const TAB_LABEL_KEYS: Record<FileAreaTabId, string> = {
  files: 'file-tree.title',
  changes: 'tab.changes',
  status: 'tab.status',
  history: 'tab.history',
  local: 'tab.local',
  remoteBranches: 'tab.remote-branches',
  ports: 'ports.title',
}

interface DetachedFileAreaWindowProps {
  request: DetachedFileAreaWindowRequest
}

export function DetachedFileAreaWindow({ request }: DetachedFileAreaWindowProps) {
  return request.kind === 'branch-workspace' ? (
    <DetachedBranchWorkspaceFileArea request={request} />
  ) : (
    <DetachedRepositoryFileArea request={request} />
  )
}

function DetachedRepositoryFileArea({
  request,
}: {
  request: DetachedGitWorktreeFileAreaRequest | DetachedPlainProjectFileAreaRequest
}) {
  const t = useT()
  const bootstrappedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  const [activeTab, setActiveTab] = useState<FileAreaTabId>(request.tab)
  const [revealRequest, setRevealRequest] = useState<{ id: number; relativePath: string } | null>(null)
  const repo = useReposStore((state) => state.repos[request.repo.id])
  const capturedPath = request.kind === 'git-worktree' ? request.worktreePath : undefined
  const branchAtPath = capturedPath
    ? repo?.data.branches.find(
        (branch) => branch.worktree?.path && sameLocalFilePath(branch.worktree.path, capturedPath),
      )
    : undefined
  const detachedAtPath = capturedPath
    ? Object.values(repo?.data.worktreesByPath ?? {}).find(
        (worktree) => sameLocalFilePath(worktree.path, capturedPath) && isSelectableDetachedWorktree(worktree),
      )
    : undefined
  const capturedBranch =
    request.kind === 'git-worktree' ? (capturedPath ? (branchAtPath?.name ?? null) : request.branch) : null
  const capturedLabel = detachedAtPath ? detachedHeadTerminalLabel(detachedAtPath) : capturedBranch
  const branchAvailable = capturedPath
    ? !!branchAtPath || !!detachedAtPath
    : !capturedBranch || !!repo?.data.branches.some((branch) => branch.name === capturedBranch)
  const surfaceAvailable =
    hydrated &&
    !!repo &&
    repo.availability.phase !== 'unavailable' &&
    branchAvailable &&
    (request.tab !== 'ports' || (request.repo.kind === 'remote' && isSshRepoId(request.repo.id)))

  useRepoStoreInvalidationRefresh()
  useSettingsQueryInvalidationSync()
  useBranchWorkspaceInvalidationSync()

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void (async () => {
      try {
        await Promise.all([useThemeStore.getState().hydrate(), useI18nStore.getState().hydrate()])
        await useReposStore.getState().hydrateSession([request.repo], request.repo.id)
      } catch (error) {
        console.warn('[detached-file-area] failed to hydrate captured context', error)
      } finally {
        setHydrated(true)
      }
    })()
  }, [request])

  useEffect(() => {
    if (!surfaceAvailable) return
    const state = useReposStore.getState()
    if (detachedAtPath) {
      if (repo.ui.selectedDetachedWorktreePath !== detachedAtPath.path)
        state.selectDetachedWorktree(repo.id, detachedAtPath.path)
    } else if (capturedBranch && repo.ui.selectedBranch !== capturedBranch) {
      state.selectBranch(repo.id, capturedBranch)
    }
  }, [capturedBranch, detachedAtPath?.path, repo, surfaceAvailable])

  function revealPath(relativePath: string) {
    setRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, relativePath }))
    setActiveTab('files')
  }

  const repoName =
    repo?.name ||
    (request.repo.kind === 'remote'
      ? request.repo.ref.displayName
      : lastPathSegment(request.repo.id) || request.repo.id)
  const activeTabLabel = t(TAB_LABEL_KEYS[activeTab])
  const sourceTabLabel = t(TAB_LABEL_KEYS[request.tab])

  useEffect(() => {
    document.title = `${activeTabLabel} — ${repoName}`
  }, [activeTabLabel, repoName])

  function retryCapturedContext() {
    setHydrated(false)
    void (async () => {
      try {
        await useReposStore.getState().hydrateSession([request.repo], request.repo.id)
      } catch (error) {
        console.warn('[detached-file-area] failed to retry captured context', error)
      } finally {
        setHydrated(true)
      }
    })()
  }

  return (
    <ErrorBoundary
      resetKey={`${request.kind}:${request.repo.id}:${capturedPath ?? capturedBranch ?? ''}:${request.tab}`}
    >
      <div className="project-file-area-tone flex h-full min-h-0 flex-col bg-background text-foreground">
        <EffectiveProjectThemeBridge />
        <Topbar
          actions={
            activeTab !== request.tab ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="detached-back"
                onClick={() => setActiveTab(request.tab)}
                className="h-7"
              >
                {t('file-area.detached.back', { tab: sourceTabLabel })}
              </Button>
            ) : null
          }
        >
          <div data-testid="detached-context" className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="max-w-52 truncate font-medium" title={repoName}>
              {repoName}
            </span>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            {capturedLabel ? (
              <>
                <span className="max-w-52 truncate font-mono text-muted-foreground" title={capturedLabel}>
                  {capturedLabel}
                </span>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            ) : null}
            <span className="truncate">{activeTabLabel}</span>
            <Badge data-testid="detached-live" variant="secondary" className="ml-1 gap-1 font-normal">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {t('file-area.detached.live')}
            </Badge>
          </div>
        </Topbar>

        {!hydrated ? (
          <div className="flex min-h-0 flex-1 animate-pulse bg-pane" aria-busy="true" />
        ) : !surfaceAvailable ? (
          <ScrollPane>
            <EmptyState
              icon={<AlertCircle size={18} />}
              title={t('file-area.detached.unavailable-title')}
              body={
                <div className="space-y-3">
                  <p>{t('file-area.detached.unavailable-body')}</p>
                  <Button type="button" variant="outline" onClick={retryCapturedContext}>
                    <RefreshCw />
                    {t('file-tree.retry')}
                  </Button>
                </div>
              }
            />
          </ScrollPane>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col bg-pane">
            <RepoExplorerPanel
              repoId={request.repo.id}
              activeTab={activeTab}
              revealRequest={revealRequest}
              onRevealPath={revealPath}
            />
          </main>
        )}
        <Toaster />
      </div>
    </ErrorBoundary>
  )
}

function DetachedBranchWorkspaceFileArea({ request }: { request: DetachedBranchWorkspaceFileAreaRequest }) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<BranchWorkspaceFileAreaTab>(request.tab)
  const [revealRequest, setRevealRequest] = useState<{ id: number; relativePath: string } | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const query = useBranchWorkspaceQuery(request.root.id)
  const workspace = query.data?.ok ? query.data.items.find((item) => item.id === request.branchWorkspaceId) : undefined
  const sourceTabLabel = t(TAB_LABEL_KEYS[request.tab])

  useRepoStoreInvalidationRefresh()
  useSettingsQueryInvalidationSync()
  useBranchWorkspaceInvalidationSync()

  useEffect(() => {
    void Promise.all([
      useThemeStore.getState().hydrate(),
      useI18nStore.getState().hydrate(),
      useReposStore.getState().hydrateSession([request.root], request.root.id),
    ]).finally(() => setHydrated(true))
  }, [request.root])

  useEffect(() => {
    document.title = `${t(TAB_LABEL_KEYS[activeTab])} — ${workspace?.directoryName ?? request.branchWorkspaceId}`
  }, [activeTab, request.branchWorkspaceId, t, workspace?.directoryName])

  function revealPath(relativePath: string) {
    setRevealRequest((current) => ({ id: (current?.id ?? 0) + 1, relativePath }))
    setActiveTab('files')
  }

  return (
    <ErrorBoundary resetKey={`${request.root.id}:${request.branchWorkspaceId}:${request.tab}`}>
      <div className="project-file-area-tone flex h-full min-h-0 flex-col bg-background text-foreground">
        <EffectiveProjectThemeBridge />
        <Topbar
          actions={
            activeTab !== request.tab ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="detached-back"
                onClick={() => setActiveTab(request.tab)}
                className="h-7"
              >
                {t('file-area.detached.back', { tab: sourceTabLabel })}
              </Button>
            ) : null
          }
        >
          <div data-testid="detached-context" className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="truncate font-medium">{workspace?.directoryName ?? request.branchWorkspaceId}</span>
            <Badge data-testid="detached-live" variant="secondary" className="gap-1 font-normal">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {t('file-area.detached.live')}
            </Badge>
          </div>
        </Topbar>
        {!hydrated || query.isLoading ? (
          <div className="flex min-h-0 flex-1 animate-pulse bg-pane" aria-busy="true" />
        ) : !workspace ? (
          <ScrollPane>
            <EmptyState
              icon={<AlertCircle size={18} />}
              title={t('file-area.detached.unavailable-title')}
              body={t('file-area.detached.unavailable-body')}
            />
          </ScrollPane>
        ) : (
          <BranchWorkspaceFileArea
            workspace={workspace}
            context={branchWorkspaceFolderContext(request.root.id, workspace)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRevealPath={revealPath}
            revealRequest={revealRequest}
            showToolbar={false}
          />
        )}
        <Toaster />
      </div>
    </ErrorBoundary>
  )
}
