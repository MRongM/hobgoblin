import { describe, expect, test } from 'vitest'
import { getRepoActivity, isRepoPrimaryRefreshBusy } from '#/web/components/repo-activity/model.ts'
import { seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { markRepoOperationTargets, nextRepoOperationId, settleRepoOperationTargets } from '#/web/stores/repos/runtime.ts'

const REPO_ID = '/tmp/gbl-repo-activity-model'

describe('repo activity model', () => {
  test('marks the primary refresh control busy while a manual refresh is active', () => {
    resetReposStore()
    seedRepoState({ id: REPO_ID })
    const opId = nextRepoOperationId(REPO_ID)
    markRepoOperationTargets(REPO_ID, opId, [{ key: 'manualRefresh', reason: 'manual-refresh' }], 'running')

    expect(isRepoPrimaryRefreshBusy(useReposStore.getState().repos[REPO_ID]!)).toBe(true)

    settleRepoOperationTargets(REPO_ID, opId, [{ key: 'manualRefresh', reason: 'manual-refresh' }], null)

    expect(isRepoPrimaryRefreshBusy(useReposStore.getState().repos[REPO_ID]!)).toBe(false)
  })
})
