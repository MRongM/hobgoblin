import { describe, expect, test, vi } from 'vitest'
import { runSnapshotSuccessWorkflow } from '#/web/stores/repos/refresh-workflows.ts'
import type { ReposGet } from '#/web/stores/repos/types.ts'
import type { ReposSet } from '#/web/stores/repos/types.ts'
import { createBranchSnapshot, installGoblinTestBridge } from '#/web/stores/repos/test-utils.ts'

describe('repo refresh workflows', () => {
  test('snapshot success asks server to prune terminals for the repo', async () => {
    const pruneCalls: unknown[] = []
    installGoblinTestBridge({
      'terminal.prune': async (input) => {
        pruneCalls.push(input)
        return { pruned: 0, remaining: 2 }
      },
    })
    const get: ReposGet = () =>
      ({
        repos: {
          '/repo': {
            id: '/repo',
            name: 'repo',
            instanceToken: 2,
            data: {
              branches: [createBranchSnapshot('feature/a', { worktree: { path: '/tmp/repo-feature-a' } })],
              currentBranch: 'feature/a',
              status: [],
              statusLoaded: false,
              worktreesByPath: {},
            },
            ui: { selectedBranch: 'feature/a', detailTab: 'status' },
          },
        },
      }) as unknown as ReturnType<ReposGet>
    const set = ((_: unknown) => {}) as ReposSet

    runSnapshotSuccessWorkflow(set, get, {
      id: '/repo',
      token: 2,
      isSnapshotCurrent: () => true,
    })
    await vi.waitFor(() => {
      expect(pruneCalls).toEqual([
        {
          repoRoot: '/repo',
        },
      ])
    })
  })

})
