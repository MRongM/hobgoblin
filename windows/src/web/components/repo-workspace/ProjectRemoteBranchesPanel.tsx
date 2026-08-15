import { useEffect, useMemo, useState } from 'react'
import { GitBranch, Loader2, RefreshCw, Search, ShieldAlert, Tag, Trash2, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#/web/components/ui/tooltip.tsx'
import { cn } from '#/web/lib/cn.ts'
import {
  deleteRepositoryRemoteBranch,
  deleteRepositoryRemoteTag,
  fetchRepository,
  getRepositoryRemoteBranches,
  getRepositoryRemoteTags,
} from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  isProtectedRemoteBranchRef,
  parseRemoteBranchRef,
  remoteBranchRefMatchesQuery,
  remoteBranchSortKey,
} from '#/shared/remote-branches.ts'
import { parseRemoteTagRef, remoteTagRefMatchesQuery, remoteTagSortKey } from '#/shared/remote-tags.ts'

interface ProjectRemoteBranchesPanelProps {
  repoId: string
}

type RemoteRefKind = 'branches' | 'tags'

interface RemoteRefParts {
  kind: RemoteRefKind
  remote: string
  name: string
  fullRef: string
}

interface RemoteRefConfig {
  kind: RemoteRefKind
  tabLabelKey: string
  icon: LucideIcon
  searchLabelKey: string
  searchPlaceholderKey: string
  refreshKey: string
  emptyKey: string
  filterEmptyKey: string
  loadErrorKey: string
  deleteKey: string
  confirmTitleKey: string
  confirmBodyKey: string
  confirmDeleteKey: string
  deleteSuccessKey: string
  valueLabelKey: string
  testIdPrefix: string
  load: (repoId: string, signal?: AbortSignal) => Promise<string[]>
  remove: (repoId: string, remote: string, name: string) => Promise<{ ok: boolean; message: string }>
  parse: (ref: string) => RemoteRefParts | null
  matches: (ref: string, query: string) => boolean
  sortKey: (ref: string) => string
  protected?: (ref: string) => boolean
}

function remoteRefDeleteTestId(ref: string): string {
  return ref.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function branchParts(ref: string): RemoteRefParts | null {
  const parsed = parseRemoteBranchRef(ref)
  return parsed ? { kind: 'branches', remote: parsed.remote, name: parsed.branch, fullRef: parsed.fullRef } : null
}

function tagParts(ref: string): RemoteRefParts | null {
  const parsed = parseRemoteTagRef(ref)
  return parsed ? { kind: 'tags', remote: parsed.remote, name: parsed.tag, fullRef: parsed.fullRef } : null
}

const REMOTE_REF_CONFIGS: Record<RemoteRefKind, RemoteRefConfig> = {
  branches: {
    kind: 'branches',
    tabLabelKey: 'remote-branches.tab',
    icon: GitBranch,
    searchLabelKey: 'remote-branches.search-label',
    searchPlaceholderKey: 'remote-branches.search-placeholder',
    refreshKey: 'remote-branches.refresh',
    emptyKey: 'remote-branches.empty',
    filterEmptyKey: 'remote-branches.filter-empty',
    loadErrorKey: 'remote-branches.load-error',
    deleteKey: 'remote-branches.delete',
    confirmTitleKey: 'remote-branches.confirm-title',
    confirmBodyKey: 'remote-branches.confirm-body',
    confirmDeleteKey: 'remote-branches.confirm-delete',
    deleteSuccessKey: 'remote-branches.delete-success',
    valueLabelKey: 'remote-branches.branch',
    testIdPrefix: 'remote-branch-delete',
    load: getRepositoryRemoteBranches,
    remove: deleteRepositoryRemoteBranch,
    parse: branchParts,
    matches: remoteBranchRefMatchesQuery,
    sortKey: remoteBranchSortKey,
    protected: isProtectedRemoteBranchRef,
  },
  tags: {
    kind: 'tags',
    tabLabelKey: 'remote-tags.tab',
    icon: Tag,
    searchLabelKey: 'remote-tags.search-label',
    searchPlaceholderKey: 'remote-tags.search-placeholder',
    refreshKey: 'remote-tags.refresh',
    emptyKey: 'remote-tags.empty',
    filterEmptyKey: 'remote-tags.filter-empty',
    loadErrorKey: 'remote-tags.load-error',
    deleteKey: 'remote-tags.delete',
    confirmTitleKey: 'remote-tags.confirm-title',
    confirmBodyKey: 'remote-tags.confirm-body',
    confirmDeleteKey: 'remote-tags.confirm-delete',
    deleteSuccessKey: 'remote-tags.delete-success',
    valueLabelKey: 'remote-tags.tag',
    testIdPrefix: 'remote-tag-delete',
    load: getRepositoryRemoteTags,
    remove: deleteRepositoryRemoteTag,
    parse: tagParts,
    matches: remoteTagRefMatchesQuery,
    sortKey: remoteTagSortKey,
  },
}

function RemoteRefConfirmBody({ target, config }: { target: RemoteRefParts; config: RemoteRefConfig }) {
  const t = useT()
  return (
    <div className="space-y-3">
      <span className="block">{t(config.confirmBodyKey)}</span>
      <dl className="space-y-1 text-xs">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t('remote-branches.remote')}</dt>
          <dd className="break-all font-mono text-foreground">{target.remote}</dd>
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t(config.valueLabelKey)}</dt>
          <dd className="break-all font-mono text-foreground">{target.name}</dd>
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t('remote-branches.full-ref')}</dt>
          <dd className="break-all font-mono text-foreground">{target.fullRef}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ProjectRemoteBranchesPanel({ repoId }: ProjectRemoteBranchesPanelProps) {
  const t = useT()
  const [activeKind, setActiveKind] = useState<RemoteRefKind>('branches')
  const [refs, setRefs] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RemoteRefParts | null>(null)
  const config = REMOTE_REF_CONFIGS[activeKind]

  async function loadRefs(kind: RemoteRefKind, signal?: AbortSignal) {
    const nextConfig = REMOTE_REF_CONFIGS[kind]
    setLoading(true)
    setError(null)
    try {
      const nextRefs = await nextConfig.load(repoId, signal)
      if (signal?.aborted) return
      setRefs(
        nextRefs
          .filter((ref) => nextConfig.parse(ref))
          .sort((a, b) => nextConfig.sortKey(a).localeCompare(nextConfig.sortKey(b))),
      )
    } catch (err) {
      if (signal?.aborted) return
      setRefs([])
      setError(err instanceof Error ? err.message : nextConfig.loadErrorKey)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const ctrl = new AbortController()
    void loadRefs(activeKind, ctrl.signal)
    return () => ctrl.abort()
  }, [activeKind, repoId])

  const visibleRefs = useMemo(() => refs.filter((ref) => config.matches(ref, query)), [config, query, refs])

  async function refresh() {
    const result = await fetchRepository(repoId, 'user')
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    await loadRefs(activeKind)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    const targetConfig = REMOTE_REF_CONFIGS[target.kind]
    const result = await targetConfig.remove(repoId, target.remote, target.name)
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    setDeleteTarget(null)
    toast.success(t(targetConfig.deleteSuccessKey))
    await loadRefs(target.kind)
  }

  const emptyTitle = error
    ? t(config.loadErrorKey)
    : query.trim()
      ? t(config.filterEmptyKey)
      : t(config.emptyKey)

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <div className="flex min-h-9 items-center gap-2 border-t border-separator/70 px-2">
        <div className="flex shrink-0 items-center rounded-md border border-separator bg-toolbar p-0.5">
          {(['branches', 'tags'] as const).map((kind) => {
            const option = REMOTE_REF_CONFIGS[kind]
            const selected = activeKind === kind
            const Icon = option.icon
            return (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                aria-pressed={selected}
                onClick={() => {
                  setActiveKind(kind)
                  setDeleteTarget(null)
                }}
                className={cn(
                  'h-6 gap-1 px-2 text-xs font-normal',
                  selected
                    ? 'bg-tab-active text-foreground hover:bg-tab-active'
                    : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(option.tabLabelKey)}
              </Button>
            )
          })}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t(config.searchLabelKey)}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(config.searchPlaceholderKey)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <AsyncButton
          data-testid={`${activeKind === 'branches' ? 'remote-branches' : 'remote-tags'}-refresh`}
          type="button"
          size="icon"
          variant="ghost"
          loading={loading}
          aria-label={t(config.refreshKey)}
          title={t(config.refreshKey)}
          onClick={refresh}
        >
          {({ busy }) =>
            busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )
          }
        </AsyncButton>
      </div>
      <ScrollPane>
        {loading && refs.length === 0 ? (
          <EmptyState title={t('common.loading')} />
        ) : visibleRefs.length === 0 ? (
          <EmptyState title={emptyTitle} body={error ? t(error) : undefined} />
        ) : (
          <TooltipProvider>
            <ul className="py-1">
              {visibleRefs.map((ref) => {
                const parsed = config.parse(ref)
                if (!parsed) return null
                const protectedRef = config.protected?.(ref) === true
                const deleteButton = (
                  <Button
                    data-testid={`${config.testIdPrefix}-${remoteRefDeleteTestId(ref)}`}
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={protectedRef}
                    aria-label={t(config.deleteKey)}
                    className={cn(
                      'size-7 shrink-0',
                      protectedRef ? 'text-muted-foreground' : 'text-danger hover:text-danger',
                    )}
                    onClick={() => setDeleteTarget(parsed)}
                  >
                    {protectedRef ? (
                      <ShieldAlert className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    )}
                  </Button>
                )
                return (
                  <li key={ref} className="flex min-h-8 items-center gap-2 px-2 text-sm hover:bg-list-row-hover">
                    <span className="min-w-0 flex-1 truncate font-mono" title={ref}>
                      {ref}
                    </span>
                    {protectedRef ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{deleteButton}</span>
                        </TooltipTrigger>
                        <TooltipContent>{t('remote-branches.protected-delete-disabled')}</TooltipContent>
                      </Tooltip>
                    ) : (
                      deleteButton
                    )}
                  </li>
                )
              })}
            </ul>
          </TooltipProvider>
        )}
      </ScrollPane>
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? t(REMOTE_REF_CONFIGS[deleteTarget.kind].confirmTitleKey) : ''}
        message={
          deleteTarget ? (
            <RemoteRefConfirmBody target={deleteTarget} config={REMOTE_REF_CONFIGS[deleteTarget.kind]} />
          ) : (
            ''
          )
        }
        confirmLabel={deleteTarget ? t(REMOTE_REF_CONFIGS[deleteTarget.kind].confirmDeleteKey) : ''}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
