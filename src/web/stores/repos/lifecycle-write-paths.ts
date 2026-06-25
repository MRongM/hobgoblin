import { lastPathSegment } from '#/web/lib/paths.ts'
import { clearGitProjection, emptyRepo, replaceRepo, replaceRepoState, resetRepoOperations, rotateRepoInstanceToken } from '#/web/stores/repos/helpers.ts'
import { restoreRepoProjectionFromSnapshot } from '#/web/stores/repos/persistence.ts'
import { disposeRepoRuntime } from '#/web/stores/repos/runtime.ts'
import { runRepoRefreshIntent } from '#/web/stores/repos/refresh-coordinator.ts'
import { repoSupportsGitData } from '#/web/stores/repos/capabilities.ts'
import { markRepoAvailable, markRepoUnavailable } from '#/web/stores/repos/availability.ts'
import {
  abortRepositoryOperation,
  initRepository as initRepositoryRpc,
  probeRepository,
} from '#/web/repo-client.ts'
import { resolveRemoteRepositoryTarget } from '#/web/remote-client.ts'
import { stopPortForwardSessionsForRepo } from '#/web/port-forwarding-client.ts'
import { recordRecentRepo } from '#/web/settings-write-paths.ts'
import type { OpenRepoResult, ReposGet, ReposSet, ReposStore } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'
import { nextActiveRepoIdAfterWorkspaceClose } from '#/web/open-workspace-state.ts'
import {
  isRemoteRepoId,
  localRepoSessionEntry,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteRepoSessionEntry,
  type RemoteRepoTarget,
  type RepoSessionEntry,
} from '#/shared/remote-repo.ts'

interface ResolvedRepo {
  id: string
  name: string
  isGitRepo?: boolean
  target?: RemoteRepoTarget
}

interface ProbeResult {
  input: string
  reason: string | null
  repo: ResolvedRepo | null
  target?: RemoteRepoTarget
}

interface InitialRepoRefresh {
  id: string
  token: number
}

export type WorkspaceCapabilityReprobeResult =
  | { kind: 'available'; id: string; token: number; isGitRepo: boolean; changed: boolean }
  | { kind: 'unavailable'; id: string; token: number; message: string }
  | { kind: 'stale' }

function sessionEntryFromInput(input: string | RepoSessionEntry): RepoSessionEntry {
  if (typeof input !== 'string') return input
  if (!isRemoteRepoId(input)) return localRepoSessionEntry(input)
  const parsed = parseRemoteRepoId(input)
  const ref = parsed ? normalizeRemoteRepoRef(parsed) : null
  return ref ? { kind: 'remote', id: ref.id, ref } : localRepoSessionEntry(input)
}

function sessionEntryForReprobe(repo: Pick<ReposStore['repos'][string], 'id' | 'remote'>): string | RepoSessionEntry {
  return repo.remote.target ? remoteRepoSessionEntry(repo.remote.target) : repo.id
}

export async function resolveRepoPath(
  input: string | RepoSessionEntry,
  onError?: (err: unknown) => void,
  fallbackError = 'error.failed-read-repo',
): Promise<ProbeResult> {
  const entry = sessionEntryFromInput(input)
  try {
    let target: RemoteRepoTarget | undefined
    if (entry.kind === 'remote') target = await resolveRemoteRepositoryTarget(entry.ref)
    const probe = await probeRepository(entry.id)
    if (!probe?.ok || !probe.root) {
      return {
        input: entry.id,
        reason: probe?.message ?? 'error.not-git-repo',
        repo: null,
        target,
      }
    }
    return {
      input: entry.id,
      reason: null,
      repo: {
        id: probe.root,
        name: probe.name ?? (entry.kind === 'remote' ? entry.ref.displayName : lastPathSegment(probe.root)),
        isGitRepo: probe.isGitRepo ?? true,
        ...(target ? { target } : {}),
      },
      target,
    }
  } catch (err) {
    onError?.(err)
    return {
      input: entry.id,
      reason: err instanceof Error ? err.message : fallbackError,
      repo: null,
    }
  }
}

function orderedInsert(order: string[], id: string, rankById?: ReadonlyMap<string, number>): string[] {
  if (!rankById) return [...order, id]
  const rank = rankById.get(id)
  if (rank === undefined) return [...order, id]
  const next = [...order]
  const index = next.findIndex((existing) => {
    const existingRank = rankById.get(existing)
    return existingRank !== undefined && existingRank > rank
  })
  next.splice(index === -1 ? next.length : index, 0, id)
  return next
}

export function addResolvedRepo(
  s: Pick<ReposStore, 'repos' | 'restorableRepoCache' | 'order'>,
  resolvedRepo: ResolvedRepo,
  rankById?: ReadonlyMap<string, number>,
): Pick<ReposStore, 'repos' | 'order'> & { changed: boolean } {
  const { id, name } = resolvedRepo
  const existing = s.repos[id]
  if (existing) {
    const nextIsGitRepo = resolvedRepo.isGitRepo ?? true
    const targetChanged =
      !!resolvedRepo.target &&
      (!existing.remote.target ||
        existing.remote.target.alias !== resolvedRepo.target.alias ||
        existing.remote.target.host !== resolvedRepo.target.host ||
        existing.remote.target.user !== resolvedRepo.target.user ||
        existing.remote.target.port !== resolvedRepo.target.port ||
        existing.remote.target.remotePath !== resolvedRepo.target.remotePath)
    const capabilityChanged = existing.isGitRepo !== nextIsGitRepo
    const availabilityChanged = existing.availability.phase !== 'available'
    if (!targetChanged && !capabilityChanged && !availabilityChanged) {
      return { repos: s.repos, order: s.order, changed: false }
    }
    const nextRepo = replaceRepo(existing, (draft) => {
      if (capabilityChanged) {
        rotateRepoInstanceToken(draft)
        resetRepoOperations(draft)
      }
      draft.isGitRepo = nextIsGitRepo
      markRepoAvailable(draft)
      if (!nextIsGitRepo) clearGitProjection(draft)
      if (targetChanged && resolvedRepo.target) draft.remote.target = resolvedRepo.target
    })
    return {
      repos: {
        ...s.repos,
        [id]: nextRepo,
      },
      order: s.order,
      changed: true,
    }
  }
  const repo = restoreRepoProjectionFromSnapshot(emptyRepo(id, name), s.restorableRepoCache[id])
  if (resolvedRepo.target) repo.remote.target = resolvedRepo.target
  if (resolvedRepo.isGitRepo === false) {
    repo.isGitRepo = false
    clearGitProjection(repo)
  }
  return {
    repos: { ...s.repos, [id]: repo },
    order: orderedInsert(s.order, id, rankById),
    changed: true,
  }
}

export function addUnavailableRepo(
  s: Pick<ReposStore, 'repos' | 'restorableRepoCache' | 'order'>,
  id: string,
  reason: string,
  target?: RemoteRepoTarget,
  rankById?: ReadonlyMap<string, number>,
): Pick<ReposStore, 'repos' | 'order'> & { changed: boolean } {
  if (s.repos[id]) return { repos: s.repos, order: s.order, changed: false }
  const cached = s.restorableRepoCache[id]
  const repo = restoreRepoProjectionFromSnapshot(emptyRepo(id, cached?.name || target?.displayName || lastPathSegment(id)), cached)
  if (target) repo.remote.target = target
  repo.availability = { phase: 'unavailable', reason, checkedAt: Date.now() }
  return {
    repos: { ...s.repos, [id]: repo },
    order: s.order.includes(id) ? s.order : orderedInsert(s.order, id, rankById),
    changed: true,
  }
}

export async function reprobeWorkspaceCapability(
  set: ReposSet,
  get: ReposGet,
  id: string,
  token: number,
): Promise<WorkspaceCapabilityReprobeResult> {
  const current = get().repos[id]
  if (!current || current.instanceToken !== token) return { kind: 'stale' }

  const resolved = await resolveRepoPath(sessionEntryForReprobe(current), undefined, 'error.not-git-repo')

  const fresh = get().repos[id]
  if (!fresh || fresh.instanceToken !== token) return { kind: 'stale' }

  if (!resolved.repo) {
    const message = resolved.reason ?? 'error.failed-read-repo'
    let nextToken = token
    set((s) => {
      const repo = s.repos[id]
      if (!repo || repo.instanceToken !== token) return s
      const nextRepo = replaceRepo(repo, (draft) => {
        rotateRepoInstanceToken(draft)
        resetRepoOperations(draft)
        markRepoUnavailable(draft, message)
      })
      nextToken = nextRepo.instanceToken
      return { repos: { ...s.repos, [id]: nextRepo } }
    })
    return { kind: 'unavailable', id, token: nextToken, message }
  }

  const resolvedRepo = resolved.repo
  let changed: boolean | null = null

  set((s) => {
    const repo = s.repos[id]
    if (!repo || repo.instanceToken !== token) return s
    const result = addResolvedRepo(s, resolvedRepo)
    changed = result.changed
    return result.changed ? { repos: result.repos, order: result.order } : s
  })

  const nextRepo = get().repos[resolvedRepo.id]
  if (changed === null || !nextRepo) return { kind: 'stale' }
  return {
    kind: 'available',
    id: resolvedRepo.id,
    token: nextRepo.instanceToken,
    isGitRepo: nextRepo.isGitRepo,
    changed,
  }
}

export function refreshInitialRepoState(get: ReposGet, refresh: InitialRepoRefresh) {
  const repo = get().repos[refresh.id]
  if (!repo || repo.instanceToken !== refresh.token) return
  void runRepoRefreshIntent(get, {
    kind: 'core-data-changed',
    reason: 'initial-load',
    id: refresh.id,
    token: refresh.token,
  })
}

function applyWorkspaceOpen(
  s: Pick<ReposStore, 'repos' | 'order' | 'restorableRepoCache'>,
  repo: ResolvedRepo,
): {
  repos: ReposStore['repos']
  order: string[]
  changed: boolean
  id: string
} {
  const { repos, order, changed } = addResolvedRepo(s, repo)
  return { repos, order, changed, id: repo.id }
}

export function createRuntimeRepoLifecycleActions(set: ReposSet, get: ReposGet): Pick<ReposStore, 'ensureWorkspaceOpen' | 'closeRepo' | 'initGitRepository'> {
  return {
    async ensureWorkspaceOpen(pathOrEntry: string | RepoSessionEntry): Promise<OpenRepoResult> {
      const entry = sessionEntryFromInput(pathOrEntry)
      const resolved = await resolveRepoPath(entry, undefined, 'error.not-git-repo')
      if (!resolved.repo) return { ok: false, message: resolved.reason ?? 'error.not-git-repo' }
      const repo = resolved.repo
      const { id } = repo
      let initialRefresh: InitialRepoRefresh | null = null
      const recentEntry = repo.target ? remoteRepoSessionEntry(repo.target) : { kind: 'local' as const, id }
      void recordRecentRepo(recentEntry).catch(() => {
        /* recent menu is best-effort */
      })

      set((s) => {
        const existingRepo = s.repos[id]
        const { repos, order, changed } = applyWorkspaceOpen(s, repo)
        const repoToRefresh = changed ? repos[id] : existingRepo
        if (repoToRefresh && repoSupportsGitData(repoToRefresh)) initialRefresh = { id, token: repoToRefresh.instanceToken }
        return changed ? { repos, order } : s
      })

      if (initialRefresh) refreshInitialRepoState(get, initialRefresh)
      return { ok: true, id }
    },

    closeRepo(id: string) {
      disposeRepoRuntime(id)
      void stopPortForwardSessionsForRepo(id).catch(() => {
        /* port-forward cleanup is best-effort; server shutdown also stops active forwards */
      })
      // Tell main to abort any cancellable network op for this repo —
      // otherwise a `git push` started right before the user closed the
      // tab keeps running for up to the network timeout, charged to a
      // tab that no longer exists. Fire-and-forget; failure is fine.
      void abortRepositoryOperation(id).catch(() => {
        /* main may have nothing to abort — ignore */
      })
      set((s) => {
        if (!s.repos[id]) return s
        const repos = { ...s.repos }
        const branchSearchQueries = { ...s.branchSearchQueries }
        const selectedTerminalByWorktree = { ...s.selectedTerminalByWorktree }
        delete repos[id]
        delete branchSearchQueries[id]
        for (const worktreeKey of Object.keys(selectedTerminalByWorktree)) {
          if (worktreeKey.startsWith(`${id}\0`)) delete selectedTerminalByWorktree[worktreeKey]
        }
        const order = s.order.filter((x) => x !== id)
        const activeId = nextActiveRepoIdAfterWorkspaceClose(s.order, s.activeId, id)
        return { repos, branchSearchQueries, selectedTerminalByWorktree, order, activeId }
      })
    },

    async initGitRepository(id: string): Promise<ExecResult> {
      const result = await initRepositoryRpc(id)
      if (!result.ok) return result
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        return replaceRepoState(s, repo, (draft) => {
          draft.isGitRepo = true
        })
      })
      const repo = get().repos[id]
      if (repo) {
        void runRepoRefreshIntent(get, {
          kind: 'core-data-changed',
          reason: 'initial-load',
          id,
          token: repo.instanceToken,
        })
      }
      return result
    },
  }
}
