import { appendRepoEvent, replaceRepoState, resultEvent } from '#/web/stores/repos/helpers.ts'
import type { RepoResultEventOptions, ReposGet, ReposSet } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'
import { addActionToWorktreeHistory } from '#/web/stores/repos/action-history.ts'
import { persistRestorableRepoSnapshot } from '#/web/stores/repos/persistence.ts'
export function createCommitActions(set: ReposSet, get: ReposGet) {
  return {
    setLastResult(
      id: string,
      result: ExecResult,
      token: number,
      options?: RepoResultEventOptions,
    ) {
      set((s) => {
        const repo = s.repos[id]
        if (!repo || repo.instanceToken !== token) return s
        return replaceRepoState(s, repo, (r) => {
          r.events = appendRepoEvent(r.events, resultEvent(result, options))
        })
      })

      if (result.ok && options?.action) {
        const snapshot = get().restorableRepoCache[id]
        if (snapshot) {
          const updated = addActionToWorktreeHistory(snapshot, options.action)
          if (updated) {
            set((s) => ({ restorableRepoCache: { ...s.restorableRepoCache, [id]: updated } }))
            persistRestorableRepoSnapshot(set, get().repos[id], token)
          }
        }
      }
    },

    clearEvents(id: string, eventIds: number[]) {
      if (eventIds.length === 0) return
      const ids = new Set(eventIds)
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        const events = repo.events.filter((event) => !ids.has(event.id))
        if (events.length === repo.events.length) return s
        return replaceRepoState(s, repo, (r) => {
          r.events = events
        })
      })
    },

    clearFetchFailed(id: string, token: number) {
      set((s) => {
        const repo = s.repos[id]
        if (!repo || repo.instanceToken !== token) return s
        if (!repo.remote.fetchFailed) return s
        return replaceRepoState(s, repo, (r) => {
          r.remote.fetchFailed = false
          r.remote.fetchError = null
        })
      })
    },
  }
}
