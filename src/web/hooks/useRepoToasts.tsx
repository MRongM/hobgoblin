import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoEventActionSuccessLabel } from '#/web/stores/repos/action-labels.ts'
import {
  hasWorktreeBootstrapSummaryDetails,
  type WorktreeBootstrapPathSummary,
  type WorktreeBootstrapSummary,
} from '#/shared/worktree-bootstrap-summary.ts'

type Translator = ReturnType<typeof useT>
type WorktreeBootstrapSummaryPathKind = 'copy' | 'symlink' | 'hardlink' | 'skippedMissing'
type WorktreeBootstrapSummaryCountKind = 'one' | 'other'

const WORKTREE_BOOTSTRAP_PATH_SUMMARY_KEYS: Record<
  WorktreeBootstrapSummaryPathKind,
  Record<WorktreeBootstrapSummaryCountKind, string>
> = {
  copy: {
    one: 'worktree-bootstrap.summary.copy-one',
    other: 'worktree-bootstrap.summary.copy-other',
  },
  symlink: {
    one: 'worktree-bootstrap.summary.symlink-one',
    other: 'worktree-bootstrap.summary.symlink-other',
  },
  hardlink: {
    one: 'worktree-bootstrap.summary.hardlink-one',
    other: 'worktree-bootstrap.summary.hardlink-other',
  },
  skippedMissing: {
    one: 'worktree-bootstrap.summary.skipped-missing-one',
    other: 'worktree-bootstrap.summary.skipped-missing-other',
  },
}
const WORKTREE_BOOTSTRAP_MORE_SUFFIX_KEY = 'worktree-bootstrap.summary.more-suffix'
const WORKTREE_BOOTSTRAP_SETUP_KEY = 'worktree-bootstrap.summary.setup'

export function RepoToastListener() {
  useRepoToasts()
  return null
}

export function useRepoToasts() {
  const t = useT()
  const repos = useReposStore((s) => s.repos)

  // `t` is read through a ref so a language flip doesn't re-fire these
  // effects (which would already be no-ops after the store clear, but
  // would still cost a render and obscure the dependency story).
  // Synced in render body so a toast fired in the same render as the
  // language switch picks up the new dict — an effect-based sync would
  // run a tick later and leave the ref one render stale.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    for (const [repoId, repo] of Object.entries(repos)) {
      const events = repo.events
      if (!events.length) continue
      for (const event of events) {
        if (event.kind === 'result') {
          const result = event.result
          const hasMessage = !!result.message
          const actionLabel = repoEventActionSuccessLabel(event.action)
          const bootstrapDescription =
            result.ok && result.worktreeBootstrap
              ? worktreeBootstrapToastDescription(result.worktreeBootstrap, tRef.current)
              : undefined
          const fallbackDescription =
            (hasMessage && !actionLabel) || !result.ok ? (
              <ToastDescription>{tRef.current(result.message || 'error.unknown')}</ToastDescription>
            ) : undefined
          const description = bootstrapDescription ?? fallbackDescription
          if (result.ok) {
            toast.success(
              actionLabel
                ? tRef.current(actionLabel.labelKey, actionLabel.labelParams)
                : tRef.current('action.result-ok'),
              {
                id: `${repoId}:result:ok:${event.id}`,
                description,
              },
            )
          } else {
            toast.error(tRef.current('action.result-error'), {
              id: `${repoId}:result:err:${event.id}`,
              description,
              duration: 10_000,
            })
          }
        } else {
          toast.error(<ToastDescription>{tRef.current(event.message)}</ToastDescription>, {
            id: `${repoId}:error:${event.id}`,
            duration: 10_000,
          })
        }
      }
      useReposStore.getState().clearEvents(
        repoId,
        events.map((event) => event.id),
      )
    }
  }, [repos])
}

function ToastDescription({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="max-h-32 w-full max-w-full min-w-0" viewportClassName="max-h-32">
      <pre className="block w-full max-w-full min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[11px] leading-relaxed">
        {children}
      </pre>
    </ScrollArea>
  )
}

function worktreeBootstrapToastDescription(
  summary: WorktreeBootstrapSummary,
  t: Translator,
): React.ReactNode | undefined {
  if (!hasWorktreeBootstrapSummaryDetails(summary)) return undefined
  const lines = [
    formatBootstrapPathLine('copy', summary.copy, t),
    formatBootstrapPathLine('symlink', summary.symlink, t),
    formatBootstrapPathLine('hardlink', summary.hardlink, t),
    formatBootstrapPathLine('skippedMissing', summary.skippedMissing, t),
    summary.setup ? t(WORKTREE_BOOTSTRAP_SETUP_KEY, { command: summary.setup.command }) : '',
  ].filter(Boolean)
  return lines.length > 0 ? <ToastDescription>{lines.join('\n')}</ToastDescription> : undefined
}

function formatBootstrapPathLine(
  kind: WorktreeBootstrapSummaryPathKind,
  summary: WorktreeBootstrapPathSummary,
  t: Translator,
): string {
  if (summary.count === 0) return ''
  const countKind: WorktreeBootstrapSummaryCountKind = summary.count === 1 ? 'one' : 'other'
  const remainingCount = summary.count - summary.paths.length
  return t(WORKTREE_BOOTSTRAP_PATH_SUMMARY_KEYS[kind][countKind], {
    count: summary.count,
    paths: summary.paths.join(', '),
    moreSuffix: remainingCount > 0 ? t(WORKTREE_BOOTSTRAP_MORE_SUFFIX_KEY, { count: remainingCount }) : '',
  })
}
