import { useEffect, useRef, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { GitBranch, Loader2, Search, Tag, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import { deleteRepositoryBranch, deleteRepositoryLocalTag, getRepositoryLocalTags } from '#/web/repo-client.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'

type LocalTab = 'branches' | 'tags'

export function ProjectLocalPanel({ repoId }: { repoId: string }) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<LocalTab>('branches')
  const [query, setQuery] = useState('')

  const tabs: { id: LocalTab; label: string; icon: typeof GitBranch }[] = [
    { id: 'branches', label: t('local.branches-tab'), icon: GitBranch },
    { id: 'tags', label: t('local.tags-tab'), icon: Tag },
  ]

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <div className="flex min-h-9 items-center gap-2 border-t border-separator/70 px-2">
        <div className="flex shrink-0 items-center rounded-md border border-separator bg-toolbar p-0.5">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id
            const Icon = tab.icon
            return (
              <Button
                key={tab.id}
                type="button"
                variant="ghost"
                aria-pressed={selected}
                onClick={() => {
                  setActiveTab(tab.id)
                  setQuery('')
                }}
                className={cn(
                  'h-6 gap-1 px-2 text-xs font-normal',
                  selected
                    ? 'bg-tab-active text-foreground hover:bg-tab-active'
                    : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {tab.label}
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
            aria-label={activeTab === 'branches' ? t('local.branches-search-label') : t('local.tags-search-label')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeTab === 'branches' ? t('local.branches-search-placeholder') : t('local.tags-search-placeholder')}
            className="h-6 pl-7 pr-6 text-xs"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setQuery('')}
              aria-label={t('local.clear-search')}
              className="absolute right-1 top-1/2 size-5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>
      {activeTab === 'branches' ? (
        <LocalBranchesPane repoId={repoId} query={query} />
      ) : (
        <LocalTagsPane repoId={repoId} query={query} />
      )}
    </section>
  )
}

function LocalBranchesPane({ repoId, query }: { repoId: string; query: string }) {
  const t = useT()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { branches, currentBranch } = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const r = s.repos[repoId]
      return {
        branches: r?.data.branches ?? [],
        currentBranch: r?.data.currentBranch ?? '',
      }
    },
    (a, b) => a.branches === b.branches && a.currentBranch === b.currentBranch,
  )

  const trimmed = query.trim().toLowerCase()
  const visible = trimmed ? branches.filter((b) => b.name.toLowerCase().includes(trimmed)) : branches

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteRepositoryBranch(repoId, target)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setDeleteTarget(null)
    toast.success(t('local.branch-delete-success'))
  }

  return (
    <>
      <ScrollPane>
        {visible.length === 0 ? (
          <EmptyState title={trimmed ? t('local.branches-filter-empty') : t('local.branches-empty')} />
        ) : (
          <div className="py-1">
            {visible.map((branch) => (
              <div
                key={branch.name}
                className="group flex min-h-7 items-center gap-1 px-3 hover:bg-list-row-hover"
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate font-mono text-xs',
                    branch.name === currentBranch ? 'font-semibold text-success' : 'text-foreground',
                  )}
                  title={branch.name}
                >
                  {branch.name}
                </span>
                {branch.name !== currentBranch && !branch.worktree?.path && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('local.branch-delete')}
                    title={t('local.branch-delete')}
                    onClick={() => setDeleteTarget(branch.name)}
                    className={cn(
                      'h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
                      'hover:bg-danger-surface hover:text-danger',
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollPane>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? t('local.branch-confirm-title', { name: deleteTarget }) : t('local.branch-confirm-title')}
        message={t('local.branch-confirm-body')}
        confirmLabel={t('local.branch-confirm-delete')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

function LocalTagsPane({ repoId, query }: { repoId: string; query: string }) {
  const t = useT()
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const loadController = useRef<AbortController | null>(null)

  async function loadTags() {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setError(null)
    try {
      const nextTags = await getRepositoryLocalTags(repoId, controller.signal)
      if (controller.signal.aborted) return
      setTags(Array.isArray(nextTags) ? nextTags.filter(Boolean) : [])
    } catch (err) {
      if (controller.signal.aborted) return
      setTags([])
      setError(err instanceof Error ? err.message : t('local.tags-load-error'))
    } finally {
      if (loadController.current === controller) loadController.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    void loadTags()
    return () => loadController.current?.abort()
  }, [repoId])

  const trimmed = query.trim().toLowerCase()
  const visible = trimmed ? tags.filter((tag) => tag.toLowerCase().includes(trimmed)) : tags

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteRepositoryLocalTag(repoId, target)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setDeleteTarget(null)
    toast.success(t('local.tag-delete-success'))
    await loadTags()
  }

  return (
    <>
      <ScrollPane>
        {loading ? (
          <EmptyState title="" icon={<Loader2 className="size-4 animate-spin" />} />
        ) : error ? (
          <EmptyState title={t('local.tags-load-error')} />
        ) : visible.length === 0 ? (
          <EmptyState title={trimmed ? t('local.tags-filter-empty') : t('local.tags-empty')} />
        ) : (
          <div className="py-1">
            {visible.map((tag) => (
              <div key={tag} className="group flex min-h-7 items-center gap-1 px-3 hover:bg-list-row-hover">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={tag}>
                  {tag}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('local.tag-delete')}
                  title={t('local.tag-delete')}
                  onClick={() => setDeleteTarget(tag)}
                  className={cn(
                    'h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
                    'hover:bg-danger-surface hover:text-danger',
                  )}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollPane>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? t('local.tag-confirm-title', { name: deleteTarget }) : t('local.tag-confirm-title')}
        message={t('local.tag-confirm-body')}
        confirmLabel={t('local.tag-confirm-delete')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}