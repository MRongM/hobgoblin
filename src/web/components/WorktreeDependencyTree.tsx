import { ChevronDown, ChevronRight, File, Folder, Link2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RepoFileTreeEntry } from '#/shared/file-tree.ts'
import type { WorktreeBootstrapSelection } from '#/shared/worktree-bootstrap-summary.ts'
import {
  hasSelectedWorktreeDependencyAncestor,
  selectWorktreeDependency,
  setWorktreeDependencyMode,
} from '#/web/components/worktree-dependency-tree-selection.ts'
import { getRepositoryFileTree } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'

interface WorktreeDependencyTreeProps {
  repoId: string
  sourceWorktreePath: string
  selections: readonly WorktreeBootstrapSelection[]
  disabled?: boolean
  onSelectionsChange: (selections: WorktreeBootstrapSelection[]) => void
  onPendingChange?: (pending: boolean) => void
}

interface DirectoryState {
  status: 'loading' | 'ready' | 'error'
  entries: RepoFileTreeEntry[]
}

export function WorktreeDependencyTree({
  repoId,
  sourceWorktreePath,
  selections,
  disabled = false,
  onSelectionsChange,
  onPendingChange,
}: WorktreeDependencyTreeProps) {
  const t = useT()
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const sourceAbortRef = useRef<AbortController | null>(null)
  const onPendingChangeRef = useRef(onPendingChange)
  onPendingChangeRef.current = onPendingChange
  const pending = Object.values(directories).some((directory) => directory.status === 'loading')

  useEffect(() => {
    onPendingChangeRef.current?.(pending)
  }, [pending])

  useEffect(
    () => () => {
      onPendingChangeRef.current?.(false)
    },
    [],
  )

  const loadDirectory = useCallback(
    async (dirPath: string, signal: AbortSignal) => {
      onPendingChangeRef.current?.(true)
      setDirectories((current) => ({
        ...current,
        [dirPath]: { status: 'loading', entries: current[dirPath]?.entries ?? [] },
      }))
      const result = await getRepositoryFileTree(repoId, sourceWorktreePath, dirPath, signal).catch(() => ({
        ok: false as const,
        message: 'error.failed-read-repo',
      }))
      if (signal.aborted) return
      setDirectories((current) => ({
        ...current,
        [dirPath]: result.ok
          ? { status: 'ready', entries: result.entries }
          : { status: 'error', entries: current[dirPath]?.entries ?? [] },
      }))
    },
    [repoId, sourceWorktreePath],
  )

  useEffect(() => {
    const controller = new AbortController()
    sourceAbortRef.current?.abort()
    sourceAbortRef.current = controller
    setDirectories({})
    setExpanded(new Set())
    void loadDirectory(sourceWorktreePath, controller.signal)
    return () => controller.abort()
  }, [loadDirectory, sourceWorktreePath])

  function toggleDirectory(entry: RepoFileTreeEntry) {
    if (entry.kind !== 'directory') return
    const nextExpanded = !expanded.has(entry.absolutePath)
    setExpanded((current) => {
      const next = new Set(current)
      if (nextExpanded) next.add(entry.absolutePath)
      else next.delete(entry.absolutePath)
      return next
    })
    if (nextExpanded && !directories[entry.absolutePath]) {
      const signal = sourceAbortRef.current?.signal
      if (signal && !signal.aborted) void loadDirectory(entry.absolutePath, signal)
    }
  }

  function retry(dirPath: string) {
    const signal = sourceAbortRef.current?.signal
    if (signal && !signal.aborted) void loadDirectory(dirPath, signal)
  }

  function renderDirectory(dirPath: string, depth: number) {
    const state = directories[dirPath]
    if (!state || state.status === 'loading') {
      return (
        <p data-worktree-dependency-loading={dirPath} className="px-2 py-1 text-xs text-muted-foreground">
          {t('worktree-dependency-tree.loading')}
        </p>
      )
    }
    if (state.status === 'error') {
      return (
        <div
          data-worktree-dependency-error={dirPath}
          className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground"
        >
          <span>{t('worktree-dependency-tree.error')}</span>
          <button
            type="button"
            data-worktree-dependency-retry={dirPath}
            className="rounded px-1.5 py-0.5 text-foreground hover:bg-muted"
            onClick={() => retry(dirPath)}
          >
            {t('worktree-dependency-tree.retry')}
          </button>
        </div>
      )
    }
    if (state.entries.length === 0) {
      return <p className="px-2 py-1 text-xs text-muted-foreground">{t('worktree-dependency-tree.empty')}</p>
    }
    return state.entries.map((entry) => renderEntry(entry, depth))
  }

  function renderEntry(entry: RepoFileTreeEntry, depth: number) {
    const isDirectory = entry.kind === 'directory'
    const isExpanded = isDirectory && expanded.has(entry.absolutePath)
    const selected = selections.find((selection) => selection.path === entry.relativePath)
    const ancestorSelected = hasSelectedWorktreeDependencyAncestor(selections, entry.relativePath)
    const selectionDisabled = disabled || ancestorSelected
    const Icon = isDirectory ? Folder : entry.kind === 'symlink' ? Link2 : File

    return (
      <div key={entry.absolutePath}>
        <div className="flex min-h-7 items-center gap-1 pr-2 text-xs" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
          {isDirectory ? (
            <button
              type="button"
              data-worktree-dependency-expand={entry.relativePath}
              aria-label={t(isExpanded ? 'worktree-dependency-tree.collapse' : 'worktree-dependency-tree.expand', {
                path: entry.relativePath,
              })}
              className="grid size-6 shrink-0 place-items-center rounded hover:bg-muted"
              disabled={disabled}
              onClick={() => toggleDirectory(entry)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="size-6 shrink-0" />
          )}
          {entry.kind === 'symlink' ? (
            <span
              data-worktree-dependency-symlink={entry.relativePath}
              title={t('worktree-dependency-tree.symlink-disabled')}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground"
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate font-mono">{entry.name}</span>
            </span>
          ) : (
            <label className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="checkbox"
                data-worktree-dependency-path={entry.relativePath}
                aria-label={t('worktree-dependency-tree.select', { path: entry.relativePath })}
                checked={!!selected}
                disabled={selectionDisabled}
                onChange={(event) =>
                  onSelectionsChange(
                    selectWorktreeDependency(selections, entry.relativePath, event.currentTarget.checked),
                  )
                }
              />
              <Icon size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{entry.name}</span>
            </label>
          )}
          {selected ? (
            <select
              data-worktree-dependency-mode={entry.relativePath}
              aria-label={t('worktree-dependency-tree.mode', { path: entry.relativePath })}
              value={selected.mode}
              disabled={disabled}
              className="h-6 rounded border border-input bg-background px-1 text-[11px]"
              onChange={(event) =>
                onSelectionsChange(
                  setWorktreeDependencyMode(
                    selections,
                    entry.relativePath,
                    event.currentTarget.value === 'copy' ? 'copy' : 'symlink',
                  ),
                )
              }
            >
              <option value="symlink">{t('worktree-dependency-tree.symlink')}</option>
              <option value="copy">{t('worktree-dependency-tree.copy')}</option>
            </select>
          ) : null}
        </div>
        {isExpanded ? renderDirectory(entry.absolutePath, depth + 1) : null}
      </div>
    )
  }

  return (
    <div className="max-h-64 overflow-auto rounded-md border border-separator bg-background py-1">
      {renderDirectory(sourceWorktreePath, 0)}
    </div>
  )
}
