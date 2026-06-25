import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderTree } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { FileListViewToolbar, type FileListViewMode } from '#/web/components/FileListViewModeControl.tsx'
import {
  FILE_TREE_FILE_NAME_CLASS,
  FilePathTreeList,
  fileTreeRowPadding,
  type FilePathTreeFileRow,
} from '#/web/components/FilePathTreeList.tsx'
import { FilePathText } from '#/web/components/FilePathText.tsx'
import { getRepositoryCommitDetail, getRepositoryHistory } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { cn } from '#/web/lib/cn.ts'
import type { CommitDetail, CommitFileChange, CommitHistoryEntry } from '#/web/types.ts'
import {
  buildHistoryGraphRows,
  commitFileStatusLabel,
  commitFileStatusTone,
  formatHistoryDate,
} from '#/web/components/repo-workspace/history-graph.ts'

const HISTORY_PAGE_SIZE = 100

interface ProjectHistoryPanelProps {
  repoId: string
  onRevealPath?: (relativePath: string) => void
}

interface HistoryView {
  branchName: string | null
  worktreePath: string | null
}

export function ProjectHistoryPanel({ repoId, onRevealPath }: ProjectHistoryPanelProps) {
  const t = useT()
  const view = useProjectHistoryView(repoId)
  const [commits, setCommits] = useState<CommitHistoryEntry[]>([])
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [detailByHash, setDetailByHash] = useState<Record<string, CommitDetail | null>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const requestSeq = useRef(0)

  useEffect(() => {
    requestSeq.current += 1
    const seq = requestSeq.current
    setCommits([])
    setSelectedHash(null)
    setDetailByHash({})
    setHistoryError(null)
    setDetailError(null)
    setHasMore(false)
    if (!view.branchName) return

    const controller = new AbortController()
    setHistoryLoading(true)
    void getRepositoryHistory(repoId, view.branchName, { limit: HISTORY_PAGE_SIZE, skip: 0 }, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted || requestSeq.current !== seq) return
        setCommits(entries)
        setSelectedHash(entries[0]?.hash ?? null)
        setHasMore(entries.length === HISTORY_PAGE_SIZE)
      })
      .catch((err) => {
        if (controller.signal.aborted || requestSeq.current !== seq) return
        setHistoryError(err instanceof Error ? err.message : 'history.load-error')
      })
      .finally(() => {
        if (!controller.signal.aborted && requestSeq.current === seq) setHistoryLoading(false)
      })

    return () => controller.abort()
  }, [repoId, view.branchName])

  useEffect(() => {
    if (!selectedHash || detailByHash[selectedHash] !== undefined) return
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError(null)
    void getRepositoryCommitDetail(repoId, selectedHash, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        setDetailByHash((current) => ({ ...current, [selectedHash]: detail }))
        if (!detail) setDetailError('history.detail-error')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setDetailError(err instanceof Error ? err.message : 'history.detail-error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
  }, [detailByHash, repoId, selectedHash])

  async function loadMore() {
    if (!view.branchName || historyLoading) return
    setHistoryLoading(true)
    setHistoryError(null)
    const controller = new AbortController()
    try {
      const entries = await getRepositoryHistory(
        repoId,
        view.branchName,
        {
          limit: HISTORY_PAGE_SIZE,
          skip: commits.length,
        },
        controller.signal,
      )
      setCommits((current) => [...current, ...entries])
      setHasMore(entries.length === HISTORY_PAGE_SIZE)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'history.load-error')
    } finally {
      setHistoryLoading(false)
    }
  }

  if (!view.branchName) {
    return <EmptyState icon={<FolderTree size={16} />} title={t('branches.empty')} body={t('history.no-branch')} />
  }

  const selectedDetail = selectedHash ? detailByHash[selectedHash] : null

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] border-t border-separator/70 bg-pane">
      <HistoryList
        commits={commits}
        selectedHash={selectedHash}
        loading={historyLoading}
        error={historyError}
        hasMore={hasMore}
        onSelect={setSelectedHash}
        onLoadMore={loadMore}
      />
      <CommitDetailPane
        detail={selectedDetail ?? null}
        loading={detailLoading}
        error={detailError}
        canReveal={!!view.worktreePath}
        onRevealPath={onRevealPath}
      />
    </section>
  )
}

function useProjectHistoryView(repoId: string): HistoryView {
  return useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      const branchName = repo?.ui.selectedBranch ?? null
      const branch = repo?.data.branches.find((entry) => entry.name === branchName)
      return { branchName, worktreePath: branch?.worktree?.path ?? null }
    },
    (a, b) => a.branchName === b.branchName && a.worktreePath === b.worktreePath,
  )
}

function HistoryList({
  commits,
  selectedHash,
  loading,
  error,
  hasMore,
  onSelect,
  onLoadMore,
}: {
  commits: CommitHistoryEntry[]
  selectedHash: string | null
  loading: boolean
  error: string | null
  hasMore: boolean
  onSelect: (hash: string) => void
  onLoadMore: () => void
}) {
  const t = useT()
  const rows = useMemo(() => buildHistoryGraphRows(commits), [commits])
  if (error && commits.length === 0) return <EmptyState title={t('history.load-error')} body={t(error)} />
  if (!loading && commits.length === 0)
    return <EmptyState title={t('history.empty-title')} body={t('history.empty-body')} />

  return (
    <div className="flex min-h-0 flex-col border-r border-separator/70">
      <ScrollPane>
        <ul className="py-1.5">
          {rows.map((row) => (
            <li key={row.commit.hash}>
              <button
                type="button"
                aria-label={row.commit.hash}
                onClick={() => onSelect(row.commit.hash)}
                className={cn(
                  'grid w-full grid-cols-[64px_minmax(0,1fr)] gap-2 px-2 py-1.5 text-left hover:bg-list-row-hover',
                  selectedHash === row.commit.hash && 'bg-list-row-selected text-list-row-selected-foreground',
                )}
              >
                <HistoryGraphCell lane={row.lane} laneCount={row.laneCount} />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{row.commit.subject}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {row.commit.shortHash} · {row.commit.author} · {formatHistoryDate(row.commit.date)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollPane>
      <div className="flex min-h-9 items-center justify-end border-t border-separator/70 px-2">
        {error && <span className="mr-auto text-xs text-danger">{t(error)}</span>}
        <Button
          data-testid="history-load-more"
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading || !hasMore}
          onClick={onLoadMore}
        >
          {loading ? t('common.loading') : t('history.load-more')}
        </Button>
      </div>
    </div>
  )
}

function HistoryGraphCell({ lane, laneCount }: { lane: number; laneCount: number }) {
  const count = Math.max(1, laneCount)
  return (
    <span
      aria-hidden="true"
      className="grid h-9 items-center"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(10px, 1fr))` }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="relative flex h-full items-center justify-center">
          <span className="absolute inset-y-0 w-px bg-separator/80" />
          {index === lane && <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />}
        </span>
      ))}
    </span>
  )
}

function CommitDetailPane({
  detail,
  loading,
  error,
  canReveal,
  onRevealPath,
}: {
  detail: CommitDetail | null
  loading: boolean
  error: string | null
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
}) {
  const t = useT()
  const [fileViewMode, setFileViewMode] = useState<FileListViewMode>('tree')
  if (loading && !detail) return <EmptyState title={t('history.detail-loading')} />
  if (error && !detail) return <EmptyState title={t('history.detail-error')} body={t(error)} />
  if (!detail) return <EmptyState title={t('history.detail-empty')} />

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-app-region-border bg-app-region px-3 py-2">
        <h3 className="truncate text-sm font-medium">{detail.subject}</h3>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{detail.hash}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {detail.author} · {formatHistoryDate(detail.date)}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {t('history.parents')}:{' '}
          {detail.parents.length > 0 ? detail.parents.map((parent) => parent.slice(0, 7)).join(', ') : '-'}
        </p>
      </div>
      {detail.files.length > 0 && <FileListViewToolbar value={fileViewMode} onChange={setFileViewMode} />}
      <ScrollPane>
        <CommitFileList
          files={detail.files}
          viewMode={fileViewMode}
          canReveal={canReveal}
          onRevealPath={onRevealPath}
        />
      </ScrollPane>
    </div>
  )
}

function CommitFileList({
  files,
  viewMode,
  canReveal,
  onRevealPath,
}: {
  files: CommitFileChange[]
  viewMode: FileListViewMode
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
}) {
  if (viewMode === 'tree') {
    return (
      <FilePathTreeList
        items={files}
        getPath={(file) => file.path}
        className="py-1.5"
        renderFile={(row) => (
          <CommitFileTreeRow
            key={`${row.item.status}-${row.path}-${row.item.oldPath ?? ''}`}
            row={row}
            canReveal={canReveal}
            onRevealPath={onRevealPath}
          />
        )}
      />
    )
  }

  return (
    <ul className="py-1.5">
      {files.map((file) => (
        <CommitFileRow
          key={`${file.status}-${file.path}-${file.oldPath ?? ''}`}
          file={file}
          canReveal={canReveal}
          onRevealPath={onRevealPath}
        />
      ))}
    </ul>
  )
}

function CommitFileTreeRow({
  row,
  canReveal,
  onRevealPath,
}: {
  row: FilePathTreeFileRow<CommitFileChange>
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
}) {
  return (
    <CommitFileRow
      file={row.item}
      canReveal={canReveal}
      onRevealPath={onRevealPath}
      displayPath={row.name}
      indent={fileTreeRowPadding(row.depth)}
    />
  )
}

function CommitFileRow({
  file,
  canReveal,
  onRevealPath,
  displayPath,
  indent,
}: {
  file: CommitFileChange
  canReveal: boolean
  onRevealPath?: (relativePath: string) => void
  displayPath?: string
  indent?: string
}) {
  const pathContent = displayPath ? (
    <span className={FILE_TREE_FILE_NAME_CLASS} title={file.path}>
      {displayPath}
    </span>
  ) : (
    <FilePathText path={file.path} />
  )
  const content = [
    <span
      key="status"
      className={cn(
        'inline-flex w-[2ch] justify-center font-mono text-sm font-semibold',
        commitFileStatusTone(file.status),
      )}
    >
      {commitFileStatusLabel(file.status)}
    </span>,
    <span key="path" className="min-w-0 truncate">
      {pathContent}
    </span>,
    <span key="additions" className="font-mono text-xs text-success">
      +{file.additions}
    </span>,
    <span key="deletions" className="font-mono text-xs text-danger">
      -{file.deletions}
    </span>,
  ]
  const rowClassName = cn(
    'grid w-full grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-center gap-3 py-0.5 pr-2 text-left',
    !indent && 'px-2',
  )
  const style = indent ? { paddingLeft: indent } : undefined
  return (
    <li>
      {canReveal && onRevealPath ? (
        <button
          type="button"
          aria-label={file.path}
          className={cn(rowClassName, 'hover:bg-list-row-hover')}
          style={style}
          onClick={() => onRevealPath(file.path)}
        >
          {content}
        </button>
      ) : (
        <div className={rowClassName} style={style}>
          {content}
        </div>
      )}
    </li>
  )
}
