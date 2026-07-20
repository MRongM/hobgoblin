import type { RepoQueryInvalidationEvent } from '#/shared/repo-query-invalidation.ts'
import { shouldSuppressRepoInvalidationSource, resetRepoInvalidationSourceState } from '#/web/stores/repos/invalidation-sources.ts'
import type { ReposGet } from '#/web/stores/repos/types.ts'

interface RepoRefreshIntentBase {
  id: string
  token: number
}

type CoreRepoRefreshReason = 'initial-load' | 'branch-action'

export type RepoRefreshIntent =
  | (RepoRefreshIntentBase & { kind: 'core-data-changed'; reason: CoreRepoRefreshReason })
  | (RepoRefreshIntentBase & { kind: 'manual-refresh-requested' })

type RepoInvalidationRefreshDisposition = 'refresh' | 'suppress'

export function repoInvalidationRefreshDisposition(
  event: Pick<RepoQueryInvalidationEvent, 'sourceToken'>,
): RepoInvalidationRefreshDisposition {
  if (shouldSuppressRepoInvalidationSource(event.sourceToken)) return 'suppress'
  return 'refresh'
}

export async function handleRepoInvalidationRefresh(
  get: ReposGet,
  event: Pick<RepoQueryInvalidationEvent, 'repoId' | 'query' | 'sourceToken'>,
  token: number,
): Promise<void> {
  const repoId = event.repoId
  const repo = get().repos[repoId]
  if (!repo || repo.instanceToken !== token || repo.availability.phase === 'unavailable') return
  const disposition = repoInvalidationRefreshDisposition(event)
  if (disposition !== 'refresh') return
  await get().refreshCoreData(repoId, { token })
}

export function resetRepoRefreshCoordinatorState(): void {
  resetRepoInvalidationSourceState()
}

export async function runRepoRefreshIntent(get: ReposGet, intent: RepoRefreshIntent): Promise<void> {
  switch (intent.kind) {
    case 'manual-refresh-requested':
      await get().syncAndRefresh(intent.id, { token: intent.token })
      return
    case 'core-data-changed':
      await get().refreshCoreData(intent.id, { token: intent.token })
      return
  }
  const exhaustive: never = intent
  return exhaustive
}
