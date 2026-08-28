import { describe, expect, test } from 'vitest'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import {
  detachedHeadTerminalLabel,
  selectedRepoWorktree,
  selectedWorktreeTabKey,
} from '#/web/stores/repos/worktree-selection.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'

const DETACHED_PATH = '/outside/task'

describe('selected repo worktree', () => {
  test('projects an authoritative detached worktree without inventing a branch', () => {
    const repo = emptyRepo('/repo', 'repo')
    repo.ui.selectedDetachedWorktreePath = DETACHED_PATH
    repo.data.worktreesByPath[DETACHED_PATH] = {
      path: DETACHED_PATH,
      head: 'abc1234567890',
      isDetached: true,
      isMain: false,
      isDirty: false,
    }

    expect(selectedRepoWorktree(repo)).toEqual({
      kind: 'detached',
      branch: null,
      worktree: repo.data.worktreesByPath[DETACHED_PATH],
      worktreePath: DETACHED_PATH,
      historyRef: 'abc1234567890',
      terminalLabel: 'HEAD@abc123456789',
    })
    expect(selectedWorktreeTabKey(repo)).toBe(`detached:${DETACHED_PATH}`)
  })

  test('projects an ordinary selected branch worktree', () => {
    const repo = emptyRepo('/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/repo-feature-a' } })
    repo.data.branches = [branch]
    repo.ui.selectedBranch = branch.name
    repo.data.worktreesByPath['/repo-feature-a'] = {
      path: '/repo-feature-a',
      branch: branch.name,
      isMain: false,
    }

    expect(selectedRepoWorktree(repo)).toMatchObject({
      kind: 'branch',
      branch,
      worktreePath: '/repo-feature-a',
      historyRef: 'feature/a',
      terminalLabel: 'feature/a',
    })
    expect(selectedWorktreeTabKey(repo)).toBe('feature/a')
  })

  test('rejects primary, prunable, and stale detached selections', () => {
    const repo = emptyRepo('/repo', 'repo')
    repo.ui.selectedDetachedWorktreePath = DETACHED_PATH

    expect(selectedRepoWorktree(repo)).toBeNull()

    repo.data.worktreesByPath[DETACHED_PATH] = {
      path: DETACHED_PATH,
      isDetached: true,
      isMain: true,
    }
    expect(selectedRepoWorktree(repo)).toBeNull()

    repo.data.worktreesByPath[DETACHED_PATH] = {
      path: DETACHED_PATH,
      isDetached: true,
      isMain: false,
      isPrunable: true,
    }
    expect(selectedRepoWorktree(repo)).toBeNull()
  })

  test('uses a stable detached terminal label with and without a known head', () => {
    expect(detachedHeadTerminalLabel({ head: '0123456789abcdef' })).toBe('HEAD@0123456789ab')
    expect(detachedHeadTerminalLabel({})).toBe('HEAD')
  })
})
