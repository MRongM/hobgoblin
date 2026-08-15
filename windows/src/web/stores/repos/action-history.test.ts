import { describe, expect, test } from 'vitest'
import { addActionToWorktreeHistory, extractWorktreePathFromAction } from '#/web/stores/repos/action-history.ts'
import type { RepoEventAction, RestorableRepoSnapshot } from '#/web/stores/repos/types.ts'

function baseSnapshot(): RestorableRepoSnapshot {
  return {
    savedAt: 1,
    name: 'test-repo',
    data: { branches: [], currentBranch: 'main' },
    ui: { selectedBranch: 'main', detailTab: 'status', worktreePathOrder: [] },
  }
}

describe('extractWorktreePathFromAction', () => {
  test('returns worktreePath for pull action', () => {
    const action: RepoEventAction = { kind: 'pull', branch: 'main', worktreePath: '/repo' }
    expect(extractWorktreePathFromAction(action)).toBe('/repo')
  })

  test('returns worktreePath for commit action', () => {
    const action: RepoEventAction = { kind: 'commit', branch: 'main', message: 'fix', worktreePath: '/repo' }
    expect(extractWorktreePathFromAction(action)).toBe('/repo')
  })

  test('returns worktreePath for merge action', () => {
    const action: RepoEventAction = { kind: 'merge', branch: 'main', sourceBranch: 'feat', worktreePath: '/repo' }
    expect(extractWorktreePathFromAction(action)).toBe('/repo')
  })

  test('returns the initiating source worktree for merge-out action', () => {
    const action: RepoEventAction = {
      kind: 'mergeOut',
      branch: 'feature/source',
      destinationBranch: 'main',
      worktreePath: '/repo-feature',
    }
    expect(extractWorktreePathFromAction(action)).toBe('/repo-feature')
  })

  test('returns undefined for createBranch action', () => {
    const action: RepoEventAction = { kind: 'createBranch', branch: 'feat', baseBranch: 'main' }
    expect(extractWorktreePathFromAction(action)).toBeUndefined()
  })

  test('returns undefined for deleteBranch action', () => {
    const action: RepoEventAction = { kind: 'deleteBranch', branch: 'old' }
    expect(extractWorktreePathFromAction(action)).toBeUndefined()
  })

  test('returns undefined for checkout without worktreePath', () => {
    const action: RepoEventAction = { kind: 'checkout', branch: 'main' }
    expect(extractWorktreePathFromAction(action)).toBeUndefined()
  })
})

describe('addActionToWorktreeHistory', () => {
  test('adds action to empty history', () => {
    const action: RepoEventAction = { kind: 'pull', branch: 'main', worktreePath: '/repo' }
    const result = addActionToWorktreeHistory(baseSnapshot(), action)
    expect(result?.ui.worktreeActionHistories?.['/repo']).toEqual([action])
  })

  test('prepends action to existing history', () => {
    const existing: RepoEventAction = { kind: 'push', branch: 'main', worktreePath: '/repo' }
    const snapshot = baseSnapshot()
    snapshot.ui = { ...snapshot.ui, worktreeActionHistories: { '/repo': [existing] } }
    const action: RepoEventAction = { kind: 'pull', branch: 'main', worktreePath: '/repo' }
    const result = addActionToWorktreeHistory(snapshot, action)
    expect(result?.ui.worktreeActionHistories?.['/repo']).toEqual([action, existing])
  })

  test('limits history to 10 entries', () => {
    const actions: RepoEventAction[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'pull' as const,
      branch: `b${i}`,
      worktreePath: '/repo',
    }))
    const snapshot = baseSnapshot()
    snapshot.ui = { ...snapshot.ui, worktreeActionHistories: { '/repo': actions } }
    const newAction: RepoEventAction = { kind: 'push', branch: 'main', worktreePath: '/repo' }
    const result = addActionToWorktreeHistory(snapshot, newAction)
    expect(result?.ui.worktreeActionHistories?.['/repo']).toHaveLength(10)
    expect(result?.ui.worktreeActionHistories?.['/repo']?.[0]).toEqual(newAction)
  })

  test('returns null for actions without worktreePath', () => {
    const action: RepoEventAction = { kind: 'createBranch', branch: 'feat', baseBranch: 'main' }
    expect(addActionToWorktreeHistory(baseSnapshot(), action)).toBeNull()
  })

  test('preserves other worktree histories', () => {
    const otherAction: RepoEventAction = { kind: 'push', branch: 'feat', worktreePath: '/other' }
    const snapshot = baseSnapshot()
    snapshot.ui = { ...snapshot.ui, worktreeActionHistories: { '/other': [otherAction] } }
    const action: RepoEventAction = { kind: 'pull', branch: 'main', worktreePath: '/repo' }
    const result = addActionToWorktreeHistory(snapshot, action)
    expect(result?.ui.worktreeActionHistories?.['/other']).toEqual([otherAction])
    expect(result?.ui.worktreeActionHistories?.['/repo']).toEqual([action])
  })
})
