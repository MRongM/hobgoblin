import { appendRepoEvent, errorEvent, updateIfFresh } from '#/web/stores/repos/helpers.ts'
import { isRepoUnavailableReason, markRepoUnavailable } from '#/web/stores/repos/availability.ts'
import { runExclusiveOperation, runLatestOperation } from '#/web/stores/repos/operation-runner.ts'
import { persistRestorableRepoSnapshot } from '#/web/stores/repos/persistence.ts'
import { runLatestResourceOperation } from '#/web/stores/repos/resource-runner.ts'
import { applyStatusToWorktreeStates } from '#/web/stores/repos/worktree-state.ts'
import { runCoreDataRefreshWorkflow, runSnapshotSuccessWorkflow } from '#/web/stores/repos/refresh-workflows.ts'
import { reprobeWorkspaceCapability } from '#/web/stores/repos/lifecycle-write-paths.ts'
import { repoSupportsGitData } from '#/web/stores/repos/capabilities.ts'
import {
  applySnapshotToRepoProjection,
  reconcileRepoWorktreeSelectionAfterStatus,
  resolveActionToken,
} from '#/web/stores/repos/refresh-state.ts'
import { createRefreshSyncHelpers } from '#/web/stores/repos/refresh-sync.ts'
import { runWithRepoInvalidationSource } from '#/web/stores/repos/invalidation-sources.ts'
import { finishResourceError, startResource } from '#/web/stores/repos/resources.ts'
import { getRepositorySnapshot, getRepositoryStatus } from '#/web/repo-client.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'
import type { ReposGet, ReposSet } from '#/web/stores/repos/types.ts'

export function createRefreshActions(set: ReposSet, get: ReposGet) {
  const { runManualSyncPipeline } = createRefreshSyncHelpers(set, get)

  async function runSnapshotSuccessFlow(
    id: string,
    token: number,
    snap: RepoSnapshot,
    isSnapshotCurrent: () => boolean,
  ): Promise<void> {
    updateIfFresh(set, id, token, (r) => {
      applySnapshotToRepoProjection(r, snap)
    })
    await runSnapshotSuccessWorkflow(set, get, {
      id,
      token,
      isSnapshotCurrent,
    })
  }

  return {
    async refreshSnapshot(id: string, options?: { token?: number }) {
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return
      const { repo: repoBefore, token } = resolved
      if (!repoSupportsGitData(repoBefore)) return
      updateIfFresh(set, id, token, (r) => {
        startResource(r.resources.snapshot, { hasData: r.data.branches.length > 0 })
      })
      await runLatestOperation({
        set,
        get,
        id,
        token,
        lane: 'read',
        operationKey: 'snapshot',
        priority: 50,
        targets: [{ key: 'snapshot', reason: 'snapshot' }],
        task: (signal) => getRepositorySnapshot(id, signal),
        errorFromResult: (snap) => (snap ? null : 'error.failed-read-repo'),
        onResult: async (snap, ctx) => {
          if (!snap) {
            updateIfFresh(set, id, token, (r) => {
              finishResourceError(r.resources.snapshot, 'error.failed-read-repo')
              r.events = appendRepoEvent(r.events, errorEvent('error.failed-read-repo'))
            })
            return
          }
          await runSnapshotSuccessFlow(id, token, snap, ctx.isCurrent)
        },
        onError: (message) => {
          updateIfFresh(set, id, token, (r) => {
            if (isRepoUnavailableReason(message)) markRepoUnavailable(r, message)
            finishResourceError(r.resources.snapshot, message)
            r.events = appendRepoEvent(r.events, errorEvent(message))
          })
        },
      })
    },

    async refreshStatus(id: string, options?: { token?: number }) {
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return
      const { repo: repoBefore, token } = resolved
      if (!repoSupportsGitData(repoBefore)) return
      await runLatestResourceOperation({
        set,
        get,
        id,
        token,
        lane: 'read',
        operationKey: 'status',
        priority: 40,
        target: { key: 'status', reason: 'status' },
        selectResource: (r) => r.resources.status,
        start: (r) => ({ hasData: r.data.statusLoaded || r.data.status.length > 0 }),
        task: (signal) => getRepositoryStatus(id, signal),
        applyResult: (r, status) => {
          r.data.status = status
          r.data.statusLoaded = true
          r.data.worktreesByPath = applyStatusToWorktreeStates(r.data.worktreesByPath, status)
          reconcileRepoWorktreeSelectionAfterStatus(r)
        },
        onSuccess: (_status, ctx) => {
          const repoAfterStatus = get().repos[id]
          if (ctx.isCurrent()) persistRestorableRepoSnapshot(set, repoAfterStatus, token)
        },
        onError: (message, r) => {
          if (isRepoUnavailableReason(message)) markRepoUnavailable(r, message)
        },
        errorLog: '[refreshStatus] failed',
      })
    },

    async refreshCoreData(id: string, options?: { token?: number }) {
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return
      const { repo: repoBefore, token } = resolved
      if (!repoSupportsGitData(repoBefore)) return
      await runCoreDataRefreshWorkflow(get, { id, token })
    },

    /** Unified sync pipeline — local and remote repos follow the same path.
     *  1) Attempt a best-effort fetch when remotes are configured.
     *  2) Always refresh the local snapshot + status afterwards.
     *  Bookkeeping (setLastResult, clearFetchFailed) is handled inline
     *  so there is one source of truth for post-sync cleanup. */
    async syncAndRefresh(id: string, options?: { token?: number }) {
      const resolved = resolveActionToken(get, id, options?.token)
      if (!resolved) return null
      const { token } = resolved
      const result = await runExclusiveOperation({
        set,
        get,
        id,
        token,
        lane: 'read',
        priority: 100,
        targets: [{ key: 'manualRefresh', reason: 'manual-refresh' }],
        task: async () =>
          await runWithRepoInvalidationSource('manual', async (sourceToken) => {
            const capability = await reprobeWorkspaceCapability(set, get, id, token)
            if (capability.kind === 'unavailable') return { ok: false as const, message: capability.message }
            if (capability.kind === 'stale') return null
            if (!capability.isGitRepo) return { ok: true as const, message: '' }
            return (
              (await runManualSyncPipeline(capability.id, capability.token, sourceToken)) ?? {
                ok: true as const,
                message: '',
              }
            )
          }),
      })
      if (result !== null) return result
      const repoAfterReprobe = get().repos[id]
      return repoAfterReprobe?.instanceToken !== token &&
        repoAfterReprobe?.availability.phase === 'unavailable' &&
        repoAfterReprobe.availability.reason === 'error.repository-root-changed'
        ? { ok: false as const, message: repoAfterReprobe.availability.reason }
        : null
    },
  }
}
