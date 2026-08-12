import { describe, expect, test } from 'vitest'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import type { TerminalSessionSummary, WorktreeTerminalSnapshot } from '#/web/components/terminal/types.ts'
import {
  activateWorkspaceParentTerminalTarget,
  resolveWorkspaceParentTerminalTarget,
} from '#/web/components/repo-workspace/workspace-parent-terminal-navigation.ts'

const ROOT = '/workspace'
const BRANCH_ONE_PATH = '/workspace/feature-one'
const BRANCH_TWO_PATH = '/workspace/feature-two'

describe('workspace parent terminal navigation', () => {
  test('prefers the selected viable root terminal over a child workspace terminal', () => {
    const rootKey = worktreeTerminalKey(ROOT, ROOT)
    const branchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: ROOT,
      rootPath: ROOT,
      activeBranchWorkspaceId: 'branch-1',
      branchWorkspaces: [{ id: 'branch-1', path: BRANCH_ONE_PATH, available: true }],
      worktreeSnapshot: snapshotReader([
        snapshot(rootKey, [session(rootKey, 1), session(rootKey, 2, { selected: true })]),
        snapshot(branchKey, [session(branchKey, 1, { selected: true })]),
      ]),
    })

    expect(target).toEqual({
      branchWorkspaceId: null,
      worktreeTerminalKey: rootKey,
      terminalKey: `${rootKey}\0terminal-2`,
    })
  })

  test('prefers the previously active viable child workspace', () => {
    const firstBranchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const secondBranchKey = worktreeTerminalKey(ROOT, BRANCH_TWO_PATH)
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: ROOT,
      rootPath: ROOT,
      activeBranchWorkspaceId: 'branch-2',
      branchWorkspaces: branchWorkspaces(),
      worktreeSnapshot: snapshotReader([
        snapshot(firstBranchKey, [session(firstBranchKey, 1, { selected: true })]),
        snapshot(secondBranchKey, [session(secondBranchKey, 1, { selected: true })]),
      ]),
    })

    expect(target?.branchWorkspaceId).toBe('branch-2')
    expect(target?.worktreeTerminalKey).toBe(secondBranchKey)
  })

  test('falls back to the first viable child workspace in supplied order', () => {
    const firstBranchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const secondBranchKey = worktreeTerminalKey(ROOT, BRANCH_TWO_PATH)
    const [firstBranch, secondBranch] = branchWorkspaces()
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: ROOT,
      rootPath: ROOT,
      activeBranchWorkspaceId: null,
      branchWorkspaces: [secondBranch!, firstBranch!],
      worktreeSnapshot: snapshotReader([
        snapshot(firstBranchKey, [session(firstBranchKey, 1, { selected: true })]),
        snapshot(secondBranchKey, [session(secondBranchKey, 1, { selected: true })]),
      ]),
    })

    expect(target?.branchWorkspaceId).toBe('branch-2')
  })

  test('ignores error and closed child workspace terminals', () => {
    const branchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: ROOT,
      rootPath: ROOT,
      activeBranchWorkspaceId: 'branch-1',
      branchWorkspaces: branchWorkspaces().slice(0, 1),
      worktreeSnapshot: snapshotReader([
        snapshot(branchKey, [
          session(branchKey, 1, { phase: 'error', selected: true }),
          session(branchKey, 2, { phase: 'closed' }),
        ]),
      ]),
    })

    expect(target).toBeNull()
  })

  test('skips an unavailable child workspace even when it has an open terminal', () => {
    const branchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const target = resolveWorkspaceParentTerminalTarget({
      rootId: ROOT,
      rootPath: ROOT,
      activeBranchWorkspaceId: 'branch-1',
      branchWorkspaces: [{ id: 'branch-1', path: BRANCH_ONE_PATH, available: false }],
      worktreeSnapshot: snapshotReader([snapshot(branchKey, [session(branchKey, 1, { selected: true })])]),
    })

    expect(target).toBeNull()
  })

  test('activates and focuses a resolved child workspace terminal in order', () => {
    const calls: string[] = []
    const branchKey = worktreeTerminalKey(ROOT, BRANCH_ONE_PATH)
    const terminalKey = `${branchKey}\0terminal-1`

    const activated = activateWorkspaceParentTerminalTarget(
      { branchWorkspaceId: 'branch-1', worktreeTerminalKey: branchKey, terminalKey },
      {
        activateOverview: () => calls.push('overview'),
        activateBranchWorkspace: (branchWorkspaceId) => calls.push(`branch:${branchWorkspaceId}`),
        selectTerminal: (worktreeKey, key) => calls.push(`select:${worktreeKey}:${key}`),
        focusTerminal: (key) => calls.push(`focus:${key}`),
        revealTerminal: () => calls.push('reveal'),
      },
    )

    expect(activated).toBe(true)
    expect(calls).toEqual([
      'overview',
      'branch:branch-1',
      `select:${branchKey}:${terminalKey}`,
      `focus:${terminalKey}`,
      'reveal',
    ])
  })
})

function branchWorkspaces() {
  return [
    { id: 'branch-1', path: BRANCH_ONE_PATH, available: true },
    { id: 'branch-2', path: BRANCH_TWO_PATH, available: true },
  ]
}

function session(
  worktreeKey: string,
  index: number,
  overrides: Partial<Pick<TerminalSessionSummary, 'phase' | 'selected'>> = {},
): TerminalSessionSummary {
  return {
    key: `${worktreeKey}\0terminal-${index}`,
    worktreeTerminalKey: worktreeKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal ${index}`,
    phase: overrides.phase ?? 'open',
    selected: overrides.selected ?? false,
    hasBell: false,
  }
}

function snapshot(worktreeKey: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return {
    worktreeTerminalKey: worktreeKey,
    selectedDescriptor: null,
    sessions,
    count: sessions.length,
  }
}

function snapshotReader(snapshots: WorktreeTerminalSnapshot[]) {
  const snapshotByKey = new Map(snapshots.map((item) => [item.worktreeTerminalKey, item]))
  return (worktreeKey: string) => snapshotByKey.get(worktreeKey) ?? snapshot(worktreeKey, [])
}
