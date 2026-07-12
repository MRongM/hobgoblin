import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { CreateTagDialog, type CreateTagRequest } from '#/web/components/CreateTagDialog.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import {
  createRepositoryLocalTag,
  deleteRepositoryLocalTag,
  getRepositoryLocalTags,
} from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'

interface ProjectTagsPanelProps {
  repoId: string
}

export function ProjectTagsPanel({ repoId }: ProjectTagsPanelProps) {
  const t = useT()
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
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
      setTags(nextTags.filter(Boolean))
    } catch (err) {
      if (controller.signal.aborted) return
      setTags([])
      setError(err instanceof Error ? err.message : 'tags.load-error')
    } finally {
      if (loadController.current === controller) loadController.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    void loadTags()
    return () => loadController.current?.abort()
  }, [repoId])

  const trimmedQuery = query.trim().toLowerCase()
  const visibleTags = trimmedQuery ? tags.filter((tag) => tag.toLowerCase().includes(trimmedQuery)) : tags

  async function handleCreateTag(request: CreateTagRequest) {
    const result = await createRepositoryLocalTag(repoId, request.name, request.ref)
    if (!result.ok) throw new Error(t(result.message))
    toast.success(t('tags.create-success'))
    await loadTags()
  }

  async function handleDeleteTag() {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteRepositoryLocalTag(repoId, target)
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    setDeleteTarget(null)
    toast.success(t('tags.delete-success'))
    await loadTags()
  }

  const isSearching = trimmedQuery.length > 0
  const showErrorState = error && tags.length === 0
  const showEmptyState = !showErrorState && !loading && visibleTags.length === 0

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <div className="flex min-h-9 items-center gap-2 border-t border-separator/70 px-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t('tags.search-label')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('tags.search-placeholder')}
            className="h-7 border-separator bg-toolbar pl-7 text-xs"
          />
          {isSearching && (
            <button
              type="button"
              aria-label={t('history.search-clear')}
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="tags-refresh"
          disabled={loading}
          onClick={() => void loadTags()}
          className="h-7 gap-1 px-2 text-xs"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t('tags.refresh')}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="tags-new"
          onClick={() => setCreateOpen(true)}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Tag className="size-3.5" />
          {t('tags.new')}
        </Button>
      </div>

      <ScrollPane>
        {showErrorState ? (
          <EmptyState title={t('tags.load-error')} body={t(error)} />
        ) : showEmptyState ? (
          <EmptyState icon={<Tag size={16} />} title={t('tags.empty')} />
        ) : (
          <div className="min-h-0 divide-y divide-separator/70">
            {visibleTags.map((tag) => (
              <div key={tag} className="group flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{tag}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  data-testid={`tag-delete-${tagToTestId(tag)}`}
                  aria-label={t('tags.delete')}
                  title={t('tags.delete')}
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

      <CreateTagDialog
        open={createOpen}
        defaultRef="HEAD"
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateTag}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? t('tags.confirm-title', { name: deleteTarget }) : t('tags.confirm-title')}
        message={t('tags.confirm-body')}
        confirmLabel={t('tags.confirm-delete')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTag}
      />
    </section>
  )
}

function tagToTestId(tag: string): string {
  return tag.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
