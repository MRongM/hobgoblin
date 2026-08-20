import { useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { GitBranch, Loader2, Search, Tag, Trash2, X, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { BranchUpstreamDisplay } from '#/web/components/branch-list/BranchUpstreamDisplay.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import {
  deleteRepositoryBranch,
  deleteRepositoryLocalTag,
  getRepositoryLocalTags,
  pushRepositoryLocalTag,
} from '#/web/repo-client.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { getBranchPushTarget, type BranchPushTarget } from '#/web/stores/repos/branch-action-write-paths.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

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
            placeholder={
              activeTab === 'branches' ? t('local.branches-search-placeholder') : t('local.tags-search-placeholder')
            }
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
  const [unmergedDeleteTarget, setUnmergedDeleteTarget] = useState<string | null>(null)
  const submitBranchAction = useReposStore((s) => s.submitBranchAction)
  const [pushTarget, setPushTarget] = useState<BranchPushTarget | null>(null)

  const repo = useStoreWithEqualityFn(
    useReposStore,
    (s) => s.repos[repoId],
    (a, b) => a?.instanceToken === b?.instanceToken && a?.operations === b?.operations && a?.resources === b?.resources,
  )

  const isPending = repo?.operations.branchAction.phase !== 'idle' || repo?.resources.fetch.phase === 'loading'

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
      if (result.message === 'error.branch-not-fully-merged') {
        setDeleteTarget(null)
        setUnmergedDeleteTarget(target)
        return
      }
      toast.error(result.message)
      return
    }
    setDeleteTarget(null)
    toast.success(t('local.branch-delete-success'))
  }

  async function handleForceDelete() {
    if (!unmergedDeleteTarget) return
    const target = unmergedDeleteTarget
    const result = await deleteRepositoryBranch(repoId, target, { force: true })
    if (!result.ok) {
      toast.error(result.message)
      setUnmergedDeleteTarget(null)
      return
    }
    setUnmergedDeleteTarget(null)
    toast.success(t('local.branch-delete-success'))
  }

  function handlePull(branchName: string) {
    submitBranchAction(repoId, { kind: 'pull', branch: branchName })
  }

  function handlePush(branch: RepoBranchState) {
    const target = getBranchPushTarget(branch)
    if (target.protected) {
      setPushTarget(target)
      return
    }
    submitBranchAction(repoId, { kind: 'push', branch: branch.name })
  }

  function confirmPush() {
    if (!pushTarget) return
    const branch = pushTarget.branch
    setPushTarget(null)
    submitBranchAction(repoId, { kind: 'push', branch })
  }

  return (
    <>
      <ScrollPane>
        {visible.length === 0 ? (
          <EmptyState title={trimmed ? t('local.branches-filter-empty') : t('local.branches-empty')} />
        ) : (
          <div className="py-1">
            {visible.map((branch) => (
              <div key={branch.name} className="group flex min-h-7 items-center gap-1 px-3 hover:bg-list-row-hover">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate font-mono text-xs',
                    branch.name === currentBranch ? 'font-semibold text-success' : 'text-foreground',
                  )}
                  title={branch.name}
                >
                  {branch.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  aria-label={t('local.branch-pull')}
                  title={t('local.branch-pull')}
                  onClick={() => handlePull(branch.name)}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  aria-label={t('local.branch-push')}
                  title={[
                    t('local.branch-push'),
                    branch.tracking ?? t('branches.no-upstream'),
                    branch.trackingGone ? t('action.branch-upstream-gone') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => handlePush(branch)}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
                </Button>
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
      <ConfirmDialog
        open={pushTarget !== null}
        title={pushTarget ? t('action.confirm-push-protected-title', { branch: pushTarget.display }) : ''}
        message={
          pushTarget ? (
            <div className="space-y-2">
              <Trans
                i18nKey="action.confirm-push-protected-body"
                values={{ branch: pushTarget.display }}
                components={{ branch: <b className="text-foreground" /> }}
              />
              <div data-push-upstream>
                <BranchUpstreamDisplay upstream={pushTarget.upstream} trackingGone={pushTarget.trackingGone} />
              </div>
            </div>
          ) : (
            ''
          )
        }
        confirmLabel={t('action.confirm-push-confirm')}
        onCancel={() => setPushTarget(null)}
        onConfirm={confirmPush}
      />
      <ConfirmDialog
        open={unmergedDeleteTarget !== null}
        title={
          unmergedDeleteTarget
            ? t('local.branch-unmerged-confirm-title', { name: unmergedDeleteTarget })
            : t('local.branch-unmerged-confirm-title')
        }
        message={t('local.branch-unmerged-confirm-body')}
        confirmLabel={t('local.branch-force-delete')}
        destructive
        onCancel={() => setUnmergedDeleteTarget(null)}
        onConfirm={handleForceDelete}
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
  const [pushingTag, setPushingTag] = useState<string | null>(null)
  const { pending: pushPending, isPending: isPushPending, run: runPush } = useAsyncPending<'push'>()

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

  async function handlePushTag(tag: string) {
    setPushingTag(tag)
    try {
      const ctrl = new AbortController()
      const sourceToken = `push-tag-${Date.now()}`
      const result = await pushRepositoryLocalTag(repoId, tag, ctrl.signal, sourceToken)
      if (!result.ok) {
        toast.error(t(result.message))
        return
      }
      toast.success(t('local.tag-push-success'))
    } finally {
      setPushingTag(null)
    }
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
                  disabled={isPushPending}
                  aria-label={t('local.tag-push')}
                  title={t('local.tag-push')}
                  onClick={() => void runPush('push', () => handlePushTag(tag))}
                  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {pushPending === 'push' && pushingTag === tag ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="size-3.5" />
                  )}
                </Button>
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
